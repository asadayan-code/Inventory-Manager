"""
Unit tests for Money (Integer Paisa arithmetic, float rejection, words formatting).
"""
import unittest
from backend.money import paisa_from_pkr_str, require_paisa, format_paisa_to_pkr, amount_to_words_pkr, InvalidMoneyError

class TestMoney(unittest.TestCase):
    def test_float_rejection(self):
        # Non-negotiable Rule 1: Floats are rejected everywhere.
        with self.assertRaises(InvalidMoneyError):
            paisa_from_pkr_str(250.50)  # Float rejected!
        with self.assertRaises(InvalidMoneyError):
            paisa_from_pkr_str(0.0)     # Float rejected!

    def test_pkr_string_parsing(self):
        self.assertEqual(paisa_from_pkr_str("250"), 25000)
        self.assertEqual(paisa_from_pkr_str("250.50"), 25050)
        self.assertEqual(paisa_from_pkr_str("250.5"), 25050)
        self.assertEqual(paisa_from_pkr_str("250.05"), 25005)
        self.assertEqual(paisa_from_pkr_str("12,500"), 1250000)
        self.assertEqual(paisa_from_pkr_str("0"), 0)
        self.assertEqual(paisa_from_pkr_str(""), 0)
        self.assertEqual(paisa_from_pkr_str(500), 50000)

    def test_invalid_strings(self):
        with self.assertRaises(InvalidMoneyError):
            paisa_from_pkr_str("abc")
        with self.assertRaises(InvalidMoneyError):
            paisa_from_pkr_str("12.345")  # Fractional paisa > 2 places rejected

    def test_format_paisa(self):
        self.assertEqual(format_paisa_to_pkr(25000), "PKR 250")
        self.assertEqual(format_paisa_to_pkr(25050), "PKR 250.50")
        self.assertEqual(format_paisa_to_pkr(1250000), "PKR 12,500")

    def test_amount_to_words(self):
        self.assertEqual(amount_to_words_pkr(0), "Zero Rupees Only")
        self.assertEqual(amount_to_words_pkr(25000), "Two Hundred and Fifty Rupees Only")
        self.assertEqual(amount_to_words_pkr(1250000), "Twelve Thousand Five Hundred Rupees Only")
        self.assertEqual(amount_to_words_pkr(25050), "Two Hundred and Fifty Rupees and 50 Paisa Only")

if __name__ == "__main__":
    unittest.main()
