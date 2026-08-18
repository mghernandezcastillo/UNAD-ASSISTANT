export default function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
  return res.status(200).json({
    status: "ok",
    geminiConfigured: Boolean(apiKey),
  });
}
