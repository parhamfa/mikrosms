from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List, Optional


@dataclass
class LTEInfo:
    interface: str
    status: str
    operator: str
    signal_strength: int  # RSSI in dBm
    registration_status: str


@dataclass
class SMSMessage:
    index: str
    phone: str
    timestamp: str
    body: str
    type: str  # "received" or "sent"


class MikroTikClient(ABC):
    """Abstract base class for MikroTik router communication."""

    @abstractmethod
    def test_connection(self) -> bool:
        """Test if connection to router works."""
        pass

    @abstractmethod
    def list_lte_interfaces(self) -> List[str]:
        """List available LTE interfaces."""
        pass

    @abstractmethod
    def get_lte_info(self, interface: str) -> Optional[LTEInfo]:
        """Get LTE modem status information."""
        pass

    @abstractmethod
    def get_sms_inbox(self, port: str = "lte1") -> List[SMSMessage]:
        """Retrieve SMS messages from modem."""
        pass

    @abstractmethod
    def send_sms(self, phone: str, message: str, port: str = "lte1") -> bool:
        """Send an SMS message."""
        pass

    @abstractmethod
    def delete_sms(self, index: str, port: str = "lte1") -> bool:
        """Delete an SMS message by index."""
        pass
