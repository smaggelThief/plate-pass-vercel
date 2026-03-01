import { NextRequest, NextResponse } from "next/server"
import {
  GoogleGenerativeAI,
  SchemaType,
} from "@google/generative-ai"

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
if (!GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY is not set in environment variables")
}

const responseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    routeOrder: {
      type: SchemaType.ARRAY,
      description:
        "Ordered array of stops. Each entry is 'PICKUP:<delivery_id>' or 'DROPOFF:<delivery_id>'. Every delivery must appear exactly twice — once as PICKUP, once as DROPOFF.",
      items: { type: SchemaType.STRING },
    },
    summary: {
      type: SchemaType.STRING,
      description:
        "Concise route summary showing ONLY the first pickup and final drop-off as: 'Start: <first address> -> End: <last address>'",
    },
    estimatedTime: {
      type: SchemaType.STRING,
      description: "Estimated total driving time, e.g. '45 mins'",
    },
  },
  required: ["routeOrder", "summary", "estimatedTime"],
}

export async function POST(request: NextRequest) {
  try {
    if (!GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "Server misconfiguration: missing API key" },
        { status: 500 },
      )
    }

    const body = await request.json()
    const { deliveries } = body as {
      deliveries: {
        id: string
        pickupLocation: string
        dropoffLocation: string
        dishName: string
      }[]
    }

    if (!deliveries || deliveries.length < 2) {
      return NextResponse.json(
        { error: "At least 2 deliveries are required for route optimization" },
        { status: 400 },
      )
    }

    const capped = deliveries.slice(0, 4)

    const deliveryList = capped
      .map(
        (d, i) =>
          `${i + 1}. ID="${d.id}" | Dish: ${d.dishName} | Pickup: ${d.pickupLocation} | Drop-off: ${d.dropoffLocation}`,
      )
      .join("\n")

    const prompt = `You are an expert logistics route optimizer for a food delivery network.

Given the following deliveries, determine the most efficient multi-stop route that minimizes total driving distance and time.

STRICT CONSTRAINT — PICKUP BEFORE DROP-OFF:
For EVERY delivery, you MUST schedule its PICKUP stop BEFORE its DROP-OFF stop in the route. A drop-off for a given delivery ID must NEVER appear before its pickup. You may interleave different deliveries (e.g., PICKUP:A, PICKUP:B, DROPOFF:A, DROPOFF:B) as long as each individual delivery's pickup always precedes its drop-off.

Optimization strategy: Group nearby pickups together when geographically efficient, then make drop-offs, while always respecting the pickup-before-dropoff constraint for every order.

Deliveries:
${deliveryList}

Return the optimal route as a JSON object.
- routeOrder: array of exactly ${capped.length * 2} strings. Each string must be either "PICKUP:<delivery_id>" or "DROPOFF:<delivery_id>" using the exact ID values from above. Every delivery ID must appear exactly twice — once prefixed with PICKUP: and once with DROPOFF:.
- summary: MUST be a concise string in EXACTLY this format: "Start: <first pickup address> -> End: <final drop-off address>". Do NOT write a paragraph or long description.
- estimatedTime: realistic driving estimate assuming city traffic, e.g. "45 mins".`

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema,
      },
    })

    const result = await model.generateContent(prompt)
    const text = result.response.text()
    const parsed = JSON.parse(text)

    parsed.routeOrder = validateAndFixRoute(parsed.routeOrder, capped)

    return NextResponse.json(parsed)
  } catch (err) {
    console.error("Route optimization failed:", err)
    const message =
      err instanceof Error ? err.message : "Unknown error during optimization"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function validateAndFixRoute(
  routeOrder: string[],
  deliveries: { id: string }[],
): string[] {
  const pickedUp = new Set<string>()
  const droppedOff = new Set<string>()
  const valid: string[] = []

  for (const stop of routeOrder) {
    if (stop.startsWith("PICKUP:")) {
      const id = stop.slice(7)
      if (deliveries.some((d) => d.id === id) && !pickedUp.has(id)) {
        pickedUp.add(id)
        valid.push(stop)
      }
    } else if (stop.startsWith("DROPOFF:")) {
      const id = stop.slice(8)
      if (pickedUp.has(id) && !droppedOff.has(id)) {
        droppedOff.add(id)
        valid.push(stop)
      }
    }
  }

  if (valid.length === deliveries.length * 2) return valid

  return [
    ...deliveries.map((d) => `PICKUP:${d.id}`),
    ...deliveries.map((d) => `DROPOFF:${d.id}`),
  ]
}
