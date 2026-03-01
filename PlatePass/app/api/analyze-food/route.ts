import { NextRequest, NextResponse } from "next/server"
import { GoogleGenerativeAI } from "@google/generative-ai"

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
if (!GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY is not set in environment variables")
}

const PROMPT = `You are a food analysis expert. Analyze this food image and return a JSON object with the following fields. Be accurate but concise.

Required JSON schema:
{
  "dish": "<name of the dish>",
  "servings": "<estimated number of servings as a whole number>",
  "allergens": "<comma-separated common allergens, e.g. Gluten, Dairy, Nuts, Eggs, Soy — write None if none>",
  "cuisine": "<cuisine type, e.g. Italian, Mexican, American, Indian>",
  "nutrition": "<brief nutrition summary, e.g. High protein, moderate carbs, low fat>",
  "waterSaved": "<estimated gallons of water saved by not wasting this food, e.g. 150 gallons>"
}

Rules:
- Return ONLY the raw JSON object, no markdown fences, no extra text.
- servings must be a string containing only digits.
- waterSaved should reflect the embedded water footprint of the food (virtual water). A typical meal is roughly 100-200 gallons.
- If you cannot identify the food, make your best guess based on visual cues.`

export async function POST(request: NextRequest) {
  try {
    if (!GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "Server misconfiguration: missing API key" },
        { status: 500 },
      )
    }

    const body = await request.json()
    const { image, mimeType } = body as {
      image: string
      mimeType: string
    }

    if (!image || !mimeType) {
      return NextResponse.json(
        { error: "Missing image or mimeType in request body" },
        { status: 400 },
      )
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" })

    const result = await model.generateContent([
      PROMPT,
      {
        inlineData: {
          data: image,
          mimeType,
        },
      },
    ])

    const text = result.response.text()

    const cleaned = text.replace(/```json\s*/g, "").replace(/```/g, "").trim()
    const parsed = JSON.parse(cleaned)

    return NextResponse.json(parsed)
  } catch (err) {
    console.error("Gemini analysis failed:", err)
    const message =
      err instanceof Error ? err.message : "Unknown error during analysis"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
