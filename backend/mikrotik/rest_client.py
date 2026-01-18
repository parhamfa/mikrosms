import httpx
from typing import List, Optional
from datetime import datetime
from .client_base import MikroTikClient, LTEInfo, SMSMessage


class MikroTikRestClient(MikroTikClient):
    """REST API implementation for MikroTik RouterOS."""

    def __init__(
        self,
        host: str,
        port: int,
        username: str,
        password: str,
        tls_verify: bool = True,
        https: bool = True,
    ):
        self.host = host
        self.port = port
        self.https = https
        self.auth = (username, password)
        self.verify = tls_verify

    def _base(self) -> str:
        scheme = "https" if self.https else "http"
        return f"{scheme}://{self.host}:{self.port}/rest"

    def _request(self, method: str, path: str, json: Optional[dict] = None, timeout: float = 15.0):
        url = f"{self._base()}{path}"
        try:
            with httpx.Client(verify=self.verify, timeout=timeout, auth=self.auth) as c:
                r = c.request(method, url, json=json)
                r.raise_for_status()
                if r.headers.get("content-type", "").startswith("application/json"):
                    return r.json()
                return r.text
        except httpx.HTTPStatusError as e:
            raise RuntimeError(f"RouterOS API error: {e.response.status_code} - {e.response.text}")
        except httpx.TransportError as e:
            # Try HTTP fallback if HTTPS fails
            if self.https:
                alt_url = f"http://{self.host}:{self.port}/rest{path}"
                with httpx.Client(verify=False, timeout=timeout, auth=self.auth) as c:
                    r = c.request(method, alt_url, json=json)
                    r.raise_for_status()
                    if r.headers.get("content-type", "").startswith("application/json"):
                        return r.json()
                    return r.text
            raise RuntimeError(f"Connection failed: {e}")

    def _get(self, path: str):
        return self._request("GET", path)

    def _post(self, path: str, json: dict = None):
        return self._request("POST", path, json=json)

    def test_connection(self) -> bool:
        try:
            self._get("/system/identity")
            return True
        except Exception:
            return False

    def list_lte_interfaces(self) -> List[str]:
        try:
            data = self._get("/interface/lte")
            return [row.get("name") for row in data if row.get("name")]
        except Exception:
            return []

    def get_lte_info(self, interface: str) -> Optional[LTEInfo]:
        try:
            # Get interface info
            data = self._get("/interface/lte")
            iface_info = None
            for row in data:
                if row.get("name") == interface:
                    iface_info = row
                    break
            
            if not iface_info:
                return None

            # Try to get signal info
            signal_strength = -999
            operator = ""
            registration = ""
            
            try:
                # LTE info endpoint (may vary by RouterOS version)
                info_data = self._post("/interface/lte/info", {"number": interface})
                if isinstance(info_data, list) and info_data:
                    info = info_data[0]
                    signal_strength = int(info.get("rssi", -999) or -999)
                    operator = info.get("operator", "")
                    registration = info.get("registration-status", "")
            except Exception:
                pass

            return LTEInfo(
                interface=interface,
                status=iface_info.get("running", "unknown"),
                operator=operator,
                signal_strength=signal_strength,
                registration_status=registration,
            )
        except Exception:
            return None

    def get_sms_inbox(self, port: str = "lte1") -> List[SMSMessage]:
        """
        Retrieve SMS messages from the modem using AT commands in PDU mode.
        This properly decodes Persian/Arabic/Unicode text.
        """
        from .sms_handler import parse_cmgl_response
        
        try:
            # First, set modem to PDU mode
            self.run_at_command("AT+CMGF=0", port)
            
            # List all messages (4 = all messages)
            # 0 = unread, 1 = read, 2 = unsent, 3 = sent, 4 = all
            response = self.run_at_command("AT+CMGL=4", port)
            
            # Parse PDU response
            decoded_messages = parse_cmgl_response(response)
            
            messages = []
            for dm in decoded_messages:
                msg = SMSMessage(
                    index=str(dm.index),
                    phone=dm.phone,
                    timestamp=dm.timestamp,
                    body=dm.body,
                    type="received",
                )
                messages.append(msg)
            
            return messages
        except Exception as e:
            # Fallback to REST API if AT commands fail
            try:
                return self._get_sms_inbox_rest(port)
            except Exception:
                raise RuntimeError(f"Failed to get SMS inbox: {e}")

    def _get_sms_inbox_rest(self, port: str = "lte1") -> List[SMSMessage]:
        """Fallback: Use REST API (may return garbled Unicode)."""
        data = self._get("/tool/sms/inbox")
        messages = []
        
        for row in data:
            msg = SMSMessage(
                index=row.get(".id", ""),
                phone=row.get("phone", ""),
                timestamp=row.get("timestamp", ""),
                body=row.get("message", ""),
                type=row.get("type", "received"),
            )
            messages.append(msg)
        
        return messages

    def send_sms(self, phone: str, message: str, port: str = "lte1") -> bool:
        """
        Send an SMS message via the LTE modem.
        Uses /tool/sms/send
        """
        try:
            self._post("/tool/sms/send", {
                "port": port,
                "phone-number": phone,
                "message": message,
            })
            return True
        except Exception as e:
            raise RuntimeError(f"Failed to send SMS: {e}")

    def delete_sms(self, index: str, port: str = "lte1") -> bool:
        """Delete an SMS message by its index."""
        try:
            self._post("/tool/sms/inbox/remove", {"numbers": index})
            return True
        except Exception as e:
            raise RuntimeError(f"Failed to delete SMS: {e}")

    def run_at_command(self, command: str, port: str = "lte1") -> str:
        """
        Run an AT command on the LTE modem.
        This can be used for advanced operations like reading PDU format directly.
        """
        try:
            result = self._post("/interface/lte/at-chat", {
                "number": port,
                "input": command,
            })
            if isinstance(result, list) and result:
                return result[0].get("output", "")
            return str(result)
        except Exception as e:
            raise RuntimeError(f"AT command failed: {e}")


def make_client(router) -> MikroTikRestClient:
    """Factory function to create a client from a router model."""
    from ..security import decrypt
    
    password = decrypt(router.secret_enc)
    https = router.proto == "rest"
    
    return MikroTikRestClient(
        host=router.host,
        port=router.port,
        username=router.username,
        password=password,
        tls_verify=router.tls_verify,
        https=https,
    )
