"""
PakAudio Retail Management System - Money Utilities
Rule: Money is ALWAYS stored as integer paisa (1 PKR = 100 paisa).
Floats are strictly rejected everywhere.
"""
from typing import Union

class InvalidMoneyError(ValueError):
    """Raised when an invalid money amount (such as float or unparseable value) is provided."""
    pass

def paisa_from_pkr_str(val: Union[str, int]) -> int:
    """
    Parses a string or int representing PKR into exact integer paisa.
    Rejects floats.
    Examples:
      "250" -> 25000 paisa
      "250.50" -> 25050 paisa
      "250.5" -> 25050 paisa
      "250.05" -> 25005 paisa
      250 -> 25000 paisa
    """
    if isinstance(val, float):
        raise InvalidMoneyError(f"Float '{val}' rejected for money. Floats introduce precision loss. Use integer paisa or decimal string.")
    
    if isinstance(val, int):
        return val * 100

    if not isinstance(val, str):
        raise InvalidMoneyError(f"Cannot parse money from type {type(val).__name__}")

    s = val.strip().replace(",", "")
    if not s:
        return 0

    negative = False
    if s.startswith("-"):
        negative = True
        s = s[1:]
    elif s.startswith("+"):
        s = s[1:]

    parts = s.split(".")
    if len(parts) == 1:
        if not parts[0].isdigit():
            raise InvalidMoneyError(f"Invalid integer PKR amount: '{val}'")
        paisa = int(parts[0]) * 100
    elif len(parts) == 2:
        whole_str, frac_str = parts
        if not (whole_str == "" or whole_str.isdigit()) or not frac_str.isdigit():
            raise InvalidMoneyError(f"Invalid decimal PKR amount: '{val}'")
        
        whole = int(whole_str) if whole_str else 0
        if len(frac_str) > 2:
            raise InvalidMoneyError(f"Fractional paisa beyond 2 decimal places not allowed: '{val}'")
        
        # Pad fraction to 2 digits (e.g. .5 -> 50 paisa, .05 -> 5 paisa)
        frac = int(frac_str.ljust(2, "0"))
        paisa = whole * 100 + frac
    else:
        raise InvalidMoneyError(f"Malformed PKR amount: '{val}'")

    return -paisa if negative else paisa

def require_paisa(val: Union[int, None], allow_none: bool = False) -> int:
    """Validates that a value is an integer paisa."""
    if val is None:
        if allow_none:
            return 0
        raise InvalidMoneyError("Money amount is required (cannot be None)")
    if isinstance(val, bool) or not isinstance(val, int):
        raise InvalidMoneyError(f"Amount must be integer paisa, got {type(val).__name__}: {val}")
    return val

def format_paisa_to_pkr(paisa: int, include_currency: bool = True) -> str:
    """Formats integer paisa into standard display string e.g. 'PKR 12,500.00' or '12,500'."""
    paisa = require_paisa(paisa)
    sign = "-" if paisa < 0 else ""
    abs_paisa = abs(paisa)
    rupees = abs_paisa // 100
    remainder = abs_paisa % 100
    
    # Format with comma separators
    rupees_formatted = f"{rupees:,}"
    if remainder > 0:
        formatted = f"{sign}{rupees_formatted}.{remainder:02d}"
    else:
        formatted = f"{sign}{rupees_formatted}"

    return f"PKR {formatted}" if include_currency else formatted

def amount_to_words_pkr(paisa: int) -> str:
    """Converts paisa into English words for invoice printing e.g. 'Twelve Thousand Five Hundred Rupees Only'."""
    paisa = require_paisa(paisa)
    if paisa == 0:
        return "Zero Rupees Only"
    
    sign = "Negative " if paisa < 0 else ""
    abs_paisa = abs(paisa)
    rupees = abs_paisa // 100
    remainder = abs_paisa % 100

    ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
            "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
            "Seventeen", "Eighteen", "Nineteen"]
    tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]

    def convert_below_thousand(n: int) -> str:
        if n == 0:
            return ""
        if n < 20:
            return ones[n]
        if n < 100:
            return tens[n // 10] + (" " + ones[n % 10] if n % 10 != 0 else "")
        return ones[n // 100] + " Hundred" + (" and " + convert_below_thousand(n % 100) if n % 100 != 0 else "")

    def num_to_words(n: int) -> str:
        if n == 0:
            return "Zero"
        parts = []
        crore = n // 10000000
        n %= 10000000
        lakh = n // 100000
        n %= 100000
        thousand = n // 1000
        n %= 1000

        if crore > 0:
            parts.append(convert_below_thousand(crore) + " Crore")
        if lakh > 0:
            parts.append(convert_below_thousand(lakh) + " Lakh")
        if thousand > 0:
            parts.append(convert_below_thousand(thousand) + " Thousand")
        if n > 0:
            parts.append(convert_below_thousand(n))

        return " ".join(parts).strip()

    rupees_str = num_to_words(rupees) + " Rupees"
    if remainder > 0:
        return f"{sign}{rupees_str} and {remainder} Paisa Only"
    return f"{sign}{rupees_str} Only"
