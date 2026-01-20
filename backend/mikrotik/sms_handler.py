"""
SMS PDU encoding/decoding utilities for proper Unicode support.
Handles UCS-2 encoding for Persian, Arabic, and emoji characters.
Supports concatenated (multi-part) SMS reassembly.
"""
import re
from typing import Optional, List, Tuple, Dict
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class DecodedSMS:
    """Represents a decoded SMS message."""
    index: str
    phone: str
    timestamp: str
    body: str
    encoding: str  # "gsm7" or "ucs2"
    # Concatenation info (for multi-part SMS)
    concat_ref: int = 0  # Reference number for concatenated SMS
    concat_total: int = 1  # Total parts
    concat_seq: int = 1  # This part's sequence number


def sanitize_unicode(text: str) -> str:
    """Remove invalid Unicode characters (surrogates) that can't be encoded to UTF-8."""
    if not text:
        return ""
    # Remove surrogate characters (U+D800 to U+DFFF) that cause 'surrogates not allowed' errors
    return "".join(c for c in text if not (0xD800 <= ord(c) <= 0xDFFF))


def decode_ucs2_hex(hex_string: str) -> str:
    """Decode UCS-2 hex string to Unicode text."""
    if not hex_string:
        return ""
    chars = []
    hex_string = hex_string.replace(" ", "").replace("\n", "")
    for i in range(0, len(hex_string), 4):
        if i + 4 <= len(hex_string):
            try:
                code = int(hex_string[i:i+4], 16)
                # Skip null, BOM, and surrogate characters
                if code > 0 and code != 0xFEFF and not (0xD800 <= code <= 0xDFFF):
                    chars.append(chr(code))
            except ValueError:
                pass
    return "".join(chars)


def swap_nibbles(s: str) -> str:
    """Swap nibbles in a hex string (used in PDU phone numbers)."""
    result = []
    for i in range(0, len(s), 2):
        if i + 1 < len(s):
            result.append(s[i+1] + s[i])
        else:
            result.append(s[i])
    return "".join(result).replace("F", "")


def decode_pdu_phone(pdu: str, length: int) -> Tuple[str, int]:
    """Decode phone number from PDU format. Returns (phone, bytes_consumed)."""
    byte_len = (length + 1) // 2
    type_byte = int(pdu[0:2], 16)
    number_hex = pdu[2:2 + byte_len * 2]
    
    # Check if alphanumeric (type 0xD0)
    if (type_byte & 0x70) == 0x50:
        # Alphanumeric - decode as GSM7
        try:
            phone = decode_gsm7_packed(number_hex, length)
        except Exception:
            phone = number_hex
    else:
        # Numeric - swap nibbles
        prefix = "+" if (type_byte & 0x70) == 0x10 else ""
        phone = prefix + swap_nibbles(number_hex)
    
    return phone, 2 + byte_len * 2


def decode_gsm7_packed(packed_hex: str, num_chars: int = 0) -> str:
    """Decode GSM 7-bit packed data."""
    gsm7_alphabet = (
        "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ "
        "!\"#¤%&'()*+,-./0123456789:;<=>?"
        "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§"
        "¿abcdefghijklmnopqrstuvwxyzäöñüà"
    )
    
    try:
        packed = bytes.fromhex(packed_hex)
    except ValueError:
        return packed_hex
    
    chars = []
    shift = 0
    prev = 0
    
    for byte in packed:
        char = ((byte << shift) | prev) & 0x7F
        if char < len(gsm7_alphabet):
            chars.append(gsm7_alphabet[char])
        else:
            chars.append(chr(char))
        
        prev = byte >> (7 - shift)
        shift += 1
        
        if shift == 7:
            if prev < len(gsm7_alphabet):
                chars.append(gsm7_alphabet[prev & 0x7F])
            shift = 0
            prev = 0
    
    if num_chars > 0:
        return "".join(chars[:num_chars])
    return "".join(chars)


def decode_pdu_timestamp(ts_hex: str) -> str:
    """Decode PDU timestamp (7 bytes, semi-octets)."""
    try:
        swapped = swap_nibbles(ts_hex[:14])
        year = int(swapped[0:2])
        month = int(swapped[2:4])
        day = int(swapped[4:6])
        hour = int(swapped[6:8])
        minute = int(swapped[8:10])
        second = int(swapped[10:12])
        
        full_year = 2000 + year if year < 80 else 1900 + year
        return f"{full_year:04d}-{month:02d}-{day:02d}T{hour:02d}:{minute:02d}:{second:02d}"
    except Exception:
        return datetime.now().isoformat()


def parse_udh(ud_hex: str) -> Tuple[Dict, int]:
    """
    Parse User Data Header for concatenated SMS.
    Returns (udh_info, header_length_in_hex_chars)
    
    UDH format:
    - UDHL (1 byte): Length of UDH
    - IEI (1 byte): Information Element Identifier
    - IEDL (1 byte): IE Data Length
    - IED (variable): IE Data
    """
    info = {
        "concat_ref": 0,
        "concat_total": 1,
        "concat_seq": 1,
    }
    
    try:
        udhl = int(ud_hex[0:2], 16)  # UDH length in bytes
        header_hex_len = 2 + udhl * 2  # Total header length in hex chars
        
        pos = 2
        while pos < header_hex_len:
            iei = int(ud_hex[pos:pos+2], 16)
            iedl = int(ud_hex[pos+2:pos+4], 16)
            ied = ud_hex[pos+4:pos+4+iedl*2]
            
            if iei == 0x00 and iedl == 3:
                # Concatenated SMS, 8-bit reference
                info["concat_ref"] = int(ied[0:2], 16)
                info["concat_total"] = int(ied[2:4], 16)
                info["concat_seq"] = int(ied[4:6], 16)
            elif iei == 0x08 and iedl == 4:
                # Concatenated SMS, 16-bit reference
                info["concat_ref"] = int(ied[0:4], 16)
                info["concat_total"] = int(ied[4:6], 16)
                info["concat_seq"] = int(ied[6:8], 16)
            
            pos += 4 + iedl * 2
        
        return info, header_hex_len
    except Exception:
        return info, 0


def decode_sms_deliver_pdu(pdu: str) -> Optional[DecodedSMS]:
    """
    Decode a SMS-DELIVER PDU message.
    Handles concatenated SMS and strips UDH from message body.
    """
    try:
        pdu = pdu.upper().replace(" ", "")
        pos = 0
        
        # Skip SCA (Service Center Address)
        sca_len = int(pdu[pos:pos+2], 16)
        pos += 2 + sca_len * 2
        
        # PDU Type byte
        pdu_type = int(pdu[pos:pos+2], 16)
        has_udh = (pdu_type & 0x40) != 0  # UDHI bit
        pos += 2
        
        # OA (Originating Address)
        oa_len = int(pdu[pos:pos+2], 16)
        pos += 2
        phone, phone_bytes = decode_pdu_phone(pdu[pos:], oa_len)
        pos += phone_bytes
        
        # PID (Protocol Identifier)
        pos += 2
        
        # DCS (Data Coding Scheme)
        dcs = int(pdu[pos:pos+2], 16)
        pos += 2
        
        # Determine encoding from DCS
        is_ucs2 = False
        if (dcs & 0xC0) == 0x00:  # General Data Coding
            alphabet = (dcs >> 2) & 0x03
            is_ucs2 = alphabet == 2
        elif (dcs & 0xF0) == 0xE0:  # UCS2 class message
            is_ucs2 = True
        
        # SCTS (Service Center Time Stamp) - 7 bytes
        timestamp = decode_pdu_timestamp(pdu[pos:pos+14])
        pos += 14
        
        # UDL (User Data Length)
        udl = int(pdu[pos:pos+2], 16)
        pos += 2
        
        # UD (User Data)
        ud_hex = pdu[pos:]
        
        # Handle UDH if present
        concat_info = {"concat_ref": 0, "concat_total": 1, "concat_seq": 1}
        if has_udh:
            concat_info, udh_len = parse_udh(ud_hex)
            ud_hex = ud_hex[udh_len:]
            
            # Adjust UDL for UDH
            if is_ucs2:
                # UDL is in octets for UCS2
                udl -= udh_len // 2
            else:
                # UDL is in septets for GSM7, UDH takes (udh_len/2) octets
                # which is (udh_len/2 * 8 / 7) septets, rounded up
                udh_bytes = udh_len // 2
                fill_bits = (7 - ((udh_bytes * 8) % 7)) % 7
                udh_septets = (udh_bytes * 8 + fill_bits) // 7
                udl -= udh_septets
        
        if is_ucs2:
            # For UCS-2, decode all remaining user data after UDH stripping
            # UDL was already adjusted above when UDH was stripped
            body = decode_ucs2_hex(ud_hex)
            encoding = "ucs2"
        else:
            # For GSM7, udl is in septets
            body = decode_gsm7_packed(ud_hex, udl if udl > 0 else 0)
            encoding = "gsm7"
        
        # Sanitize to remove any invalid Unicode characters
        body = sanitize_unicode(body)
        
        return DecodedSMS(
            index=0,
            phone=phone,
            timestamp=timestamp,
            body=body,
            encoding=encoding,
            concat_ref=concat_info["concat_ref"],
            concat_total=concat_info["concat_total"],
            concat_seq=concat_info["concat_seq"],
        )
    except Exception as e:
        return None


def parse_cmgl_response(response: str) -> List[DecodedSMS]:
    """
    Parse AT+CMGL response in PDU mode.
    Reassembles concatenated SMS into single messages.
    """
    messages = []
    lines = response.strip().split("\n")
    
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        
        if line.startswith("+CMGL:"):
            match = re.match(r'\+CMGL:\s*(\d+),\s*(\d+),.*?,\s*(\d+)', line)
            if match:
                index = int(match.group(1))
                
                if i + 1 < len(lines):
                    pdu_line = lines[i + 1].strip()
                    if pdu_line and not pdu_line.startswith("+") and pdu_line != "OK":
                        decoded = decode_sms_deliver_pdu(pdu_line)
                        if decoded:
                            decoded.index = index
                            messages.append(decoded)
                        i += 1
        i += 1
    
    # Reassemble concatenated messages
    return reassemble_concatenated(messages)


def reassemble_concatenated(messages: List[DecodedSMS]) -> List[DecodedSMS]:
    """Reassemble concatenated SMS parts into complete messages."""
    # Group by (phone, concat_ref) for multi-part messages
    groups: Dict[Tuple[str, int], List[DecodedSMS]] = {}
    single_messages = []
    
    for msg in messages:
        if msg.concat_total > 1:
            key = (msg.phone, msg.concat_ref)
            if key not in groups:
                groups[key] = []
            groups[key].append(msg)
        else:
            single_messages.append(msg)
    
    # Reassemble each group
    reassembled = []
    for key, parts in groups.items():
        # Sort by sequence number
        parts.sort(key=lambda x: x.concat_seq)
        
        # Combine bodies
        combined_body = "".join(p.body for p in parts)
        
        # Check if all parts are present
        expected_total = parts[0].concat_total
        if len(parts) < expected_total:
            combined_body += f"\n\n[⚠️ Message incomplete: {len(parts)}/{expected_total} parts received]"
        
        # Use first part's metadata
        first = parts[0]
        reassembled.append(DecodedSMS(
            index=first.index,
            phone=first.phone,
            timestamp=first.timestamp,
            body=combined_body,
            encoding=first.encoding,
            concat_ref=0,
            concat_total=1,
            concat_seq=1,
        ))
    
    return single_messages + reassembled


def parse_cmgr_response(response: str) -> Optional[DecodedSMS]:
    """Parse AT+CMGR response in PDU mode."""
    lines = response.strip().split("\n")
    
    for i, line in enumerate(lines):
        line = line.strip()
        if line.startswith("+CMGR:"):
            if i + 1 < len(lines):
                pdu_line = lines[i + 1].strip()
                if pdu_line and pdu_line != "OK":
                    return decode_sms_deliver_pdu(pdu_line)
    
    return None
