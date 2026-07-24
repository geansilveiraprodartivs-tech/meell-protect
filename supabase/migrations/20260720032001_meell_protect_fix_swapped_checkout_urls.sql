/*
# Fix swapped checkout_url for Start and Business plans

1. Purpose
- The Cakto API confirmed that the checkout URLs for Start and Business were
  swapped. The API returned:
    - offer "37jm2yg" = "Meell Protect - Protect Start" (R$ 29)
    - offer "acgx4jt" = "Meell Protect - Protect Business" (R$ 99)
  So the correct checkout URLs are:
    - Start    -> https://pay.cakto.com.br/37jm2yg
    - Business -> https://pay.cakto.com.br/acgx4jt
  Pro was already correct.

2. Modified Tables
- `plans` — updates checkout_url for start and business only.
*/

UPDATE plans SET checkout_url = 'https://pay.cakto.com.br/37jm2yg' WHERE id = 'start';
UPDATE plans SET checkout_url = 'https://pay.cakto.com.br/acgx4jt' WHERE id = 'business';
