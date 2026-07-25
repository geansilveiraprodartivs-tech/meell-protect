const ALLOWED_ORIGINS = [
  "https://geansilveiraprodartivs-tech.github.io",
  "https://meell-protect--geansilveira.replit.app",
  "https://unykxswtuosarguhiflh.supabase.co",
  "http://localhost:5173",
  "http://localhost:5000",
];

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
  };
}
