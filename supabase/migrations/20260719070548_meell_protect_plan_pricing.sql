/*
# MEELL PROTECT — Plan pricing + checkout links

1. Changes
- Add `checkout_url` column to `plans` (text, nullable).
- Update Protect Business price to R$ 99/mês (was R$ 169).
- Set checkout_url for start, pro, business plans (Cakto links).
- Free plan keeps null checkout_url.

2. Security
- No RLS policy changes. plans remains public read.
*/

ALTER TABLE plans ADD COLUMN IF NOT EXISTS checkout_url text;

UPDATE plans SET
  price_cents = 9900,
  price_label = 'R$ 99/mês',
  checkout_url = 'https://pay.cakto.com.br/acgx4jt'
WHERE id = 'business';

UPDATE plans SET
  checkout_url = 'https://pay.cakto.com.br/afm6i4y'
WHERE id = 'pro';

UPDATE plans SET
  checkout_url = 'https://pay.cakto.com.br/37jm2yg_989500'
WHERE id = 'start';

UPDATE plans SET
  checkout_url = NULL
WHERE id = 'free';
