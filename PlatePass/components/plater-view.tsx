"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  Weight,
  Heart,
  Upload,
  Sparkles,
  Pencil,
  Clock,
  MapPin,
  CalendarDays,
  Plus,
  Loader2,
  Package,
  Truck,
  Ban,
  Droplets,
  Apple,
  ImageIcon,
} from "lucide-react"
import { supabase } from "@/lib/supabase"

const statsStagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
} as const

const statCard = {
  hidden: { opacity: 0, y: 15 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
}

const rowVariant = {
  initial: { opacity: 0, scale: 0.97 },
  animate: { opacity: 1, scale: 1, transition: { type: "spring" as const, stiffness: 300, damping: 25 } },
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.2 } },
}

interface Donation {
  id: string
  dish_name: string
  servings: number
  allergens: string | null
  cuisine: string | null
  location: string
  status: string
  pickup_start: string | null
  pickup_end: string | null
  created_at: string
}

interface IncomingOrder {
  id: string
  servings: number
  delivery_method: string
  delivery_address: string | null
  status: string
  created_at: string
  donations: {
    dish_name: string
    location: string
  }
}

function getOrderStatusDisplay(status: string) {
  switch (status) {
    case "pending":
      return { label: "Pending", className: "bg-amber-500/10 text-amber-700 dark:text-amber-400" }
    case "volunteer_accepted":
      return { label: "Passer Assigned", className: "bg-blue-500/10 text-blue-700 dark:text-blue-400" }
    case "picked_up":
      return { label: "In Transit", className: "bg-violet-500/10 text-violet-700 dark:text-violet-400" }
    case "completed":
      return { label: "Completed", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" }
    case "cancelled":
      return { label: "Cancelled", className: "bg-red-500/10 text-red-700 dark:text-red-400" }
    default:
      return { label: status, className: "bg-muted text-muted-foreground" }
  }
}

export function PlaterView() {
  const [showAIResult, setShowAIResult] = useState(false)
  const [editing, setEditing] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [aiData, setAiData] = useState({
    dish: "",
    servings: "",
    allergens: "",
    cuisine: "",
    nutrition: "",
    waterSaved: "",
  })

  const [timeStart, setTimeStart] = useState("14:00")
  const [timeEnd, setTimeEnd] = useState("16:00")
  const [location, setLocation] = useState("83 E Main St, Newark, DE")

  const [donations, setDonations] = useState<Donation[]>([])
  const [loadingDonations, setLoadingDonations] = useState(true)
  const [creating, setCreating] = useState(false)

  const [incomingOrders, setIncomingOrders] = useState<IncomingOrder[]>([])
  const [loadingOrders, setLoadingOrders] = useState(true)

  const [editingDonation, setEditingDonation] = useState<Donation | null>(null)
  const [editForm, setEditForm] = useState({ servings: "", timeStart: "", timeEnd: "" })
  const [saving, setSaving] = useState(false)

  const fetchDonations = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from("donations")
        .select("*")
        .eq("restaurant_id", user.id)
        .order("created_at", { ascending: false })

      if (!error && data) {
        setDonations(data)
      }
    } catch {
      // Table may not exist yet
    } finally {
      setLoadingDonations(false)
    }
  }, [])

  const fetchOrders = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*, donations(dish_name, location)")
        .in("status", ["pending", "volunteer_accepted", "picked_up"])
        .order("created_at", { ascending: false })

      if (!error && data) setIncomingOrders(data as IncomingOrder[])
    } catch {
      // Table may not exist yet
    } finally {
      setLoadingOrders(false)
    }
  }, [])

  useEffect(() => {
    fetchDonations()
    fetchOrders()
  }, [fetchDonations, fetchOrders])

  const totalServings = donations.reduce((sum, d) => sum + d.servings, 0)
  const activeEvents = donations.filter((d) => d.status === "available").length

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setAnalyzeError(null)
    setImagePreview(URL.createObjectURL(file))
    setShowAIResult(false)
    setEditing(false)
    setAnalyzing(true)

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as string
          resolve(result.split(",")[1])
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const res = await fetch("/api/analyze-food", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, mimeType: file.type }),
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody.error || `Server error ${res.status}`)
      }

      const data = await res.json()
      setAiData({
        dish: data.dish ?? "",
        servings: String(data.servings ?? ""),
        allergens: data.allergens ?? "",
        cuisine: data.cuisine ?? "",
        nutrition: data.nutrition ?? "",
        waterSaved: data.waterSaved ?? "",
      })
      setShowAIResult(true)
    } catch (err) {
      console.error("Food analysis failed:", err)
      setAnalyzeError(err instanceof Error ? err.message : "Analysis failed")
    } finally {
      setAnalyzing(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  async function handleCreateEvent() {
    setCreating(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const today = new Date().toISOString().split("T")[0]

      const { error } = await supabase.from("donations").insert({
        restaurant_id: user.id,
        dish_name: aiData.dish,
        servings: parseInt(aiData.servings) || 0,
        allergens: aiData.allergens || null,
        cuisine: aiData.cuisine || null,
        location,
        pickup_start: `${today}T${timeStart}:00`,
        pickup_end: `${today}T${timeEnd}:00`,
      })

      if (error) throw error

      await fetchDonations()

      setShowAIResult(false)
      setImagePreview(null)
      setAiData({ dish: "", servings: "", allergens: "", cuisine: "", nutrition: "", waterSaved: "" })
    } catch (err) {
      console.error("Failed to create donation:", err)
    } finally {
      setCreating(false)
    }
  }

  function openEditDialog(donation: Donation) {
    const startTime = donation.pickup_start
      ? new Date(donation.pickup_start).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
      : "14:00"
    const endTime = donation.pickup_end
      ? new Date(donation.pickup_end).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
      : "16:00"
    setEditForm({
      servings: String(donation.servings),
      timeStart: startTime,
      timeEnd: endTime,
    })
    setEditingDonation(donation)
  }

  async function handleSaveEdit() {
    if (!editingDonation) return
    setSaving(true)
    try {
      const today = editingDonation.pickup_start
        ? editingDonation.pickup_start.split("T")[0]
        : new Date().toISOString().split("T")[0]

      const { error } = await supabase
        .from("donations")
        .update({
          servings: parseInt(editForm.servings) || editingDonation.servings,
          pickup_start: `${today}T${editForm.timeStart}:00`,
          pickup_end: `${today}T${editForm.timeEnd}:00`,
        })
        .eq("id", editingDonation.id)

      if (error) throw error
      setEditingDonation(null)
      await fetchDonations()
    } catch (err) {
      console.error("Failed to update donation:", err)
    } finally {
      setSaving(false)
    }
  }

  async function handleCancelDonation(donationId: string) {
    try {
      const { error } = await supabase
        .from("donations")
        .update({ status: "cancelled" })
        .eq("id", donationId)

      if (error) throw error
      await fetchDonations()
    } catch (err) {
      console.error("Failed to cancel donation:", err)
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Top Stats */}
      <motion.div
        className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4"
        variants={statsStagger}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={statCard}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Waste Saved</CardTitle>
              <Weight className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-foreground">
                {totalServings > 0 ? `${Math.round(totalServings * 0.75).toLocaleString()} lbs` : "0 lbs"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Estimated from servings donated</p>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div variants={statCard}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Meals Donated</CardTitle>
              <Heart className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-foreground">{totalServings.toLocaleString()}</p>
              <p className="mt-1 text-xs text-muted-foreground">Across {donations.length} donation{donations.length !== 1 ? "s" : ""}</p>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div variants={statCard}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Events</CardTitle>
              <CalendarDays className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-foreground">{activeEvents}</p>
              <p className="mt-1 text-xs text-muted-foreground">Currently available for pickup</p>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div variants={statCard}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending Orders</CardTitle>
              <Package className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-foreground">{incomingOrders.length}</p>
              <p className="mt-1 text-xs text-muted-foreground">Active orders on your donations</p>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      <div className="grid gap-8 lg:grid-cols-5">
        {/* Create Donation Form */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              Create Donation Event
            </CardTitle>
            <CardDescription>Fill in the details and upload an image to auto-analyze the food.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="time-start">Time Start</Label>
                <Input
                  id="time-start"
                  type="time"
                  value={timeStart}
                  onChange={(e) => setTimeStart(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="time-end">Time End</Label>
                <Input
                  id="time-end"
                  type="time"
                  value={timeEnd}
                  onChange={(e) => setTimeEnd(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="location">Pickup Location</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="location"
                  className="pl-10"
                  placeholder="100 College Ave, Newark, DE"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Food Image</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelected}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={analyzing}
                className="relative flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/30 overflow-hidden transition-colors hover:border-primary hover:bg-muted/60 disabled:cursor-wait disabled:opacity-70"
              >
                {imagePreview ? (
                  <img
                    src={imagePreview}
                    alt="Food preview"
                    className="absolute inset-0 h-full w-full object-cover opacity-30"
                  />
                ) : null}
                {analyzing ? (
                  <div className="z-10 flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-sm font-medium text-primary">Analyzing food with AI…</span>
                  </div>
                ) : imagePreview ? (
                  <div className="z-10 flex flex-col items-center gap-2">
                    <ImageIcon className="h-8 w-8 text-primary" />
                    <span className="text-sm text-foreground font-medium">Click to upload a different image</span>
                  </div>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Click to upload an image</span>
                    <span className="text-xs text-muted-foreground/70">PNG, JPG up to 5MB</span>
                  </>
                )}
              </button>
              {analyzeError && (
                <p className="text-sm text-red-600 dark:text-red-400">{analyzeError}</p>
              )}
            </div>

            <AnimatePresence>
            {showAIResult && (
              <motion.div
                className="rounded-lg border border-primary/30 bg-primary/5 p-4"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold text-foreground">AI Analysis Result</span>
                  </div>
                  <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => setEditing(!editing)}>
                    <Pencil className="h-3 w-3" /> {editing ? "Done" : "Edit"}
                  </Button>
                </div>
                {editing ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Dish</Label>
                      <Input value={aiData.dish} onChange={(e) => setAiData({ ...aiData, dish: e.target.value })} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Est. Servings</Label>
                      <Input value={aiData.servings} onChange={(e) => setAiData({ ...aiData, servings: e.target.value })} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Allergens</Label>
                      <Input value={aiData.allergens} onChange={(e) => setAiData({ ...aiData, allergens: e.target.value })} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Cuisine</Label>
                      <Input value={aiData.cuisine} onChange={(e) => setAiData({ ...aiData, cuisine: e.target.value })} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Nutrition Facts</Label>
                      <Input value={aiData.nutrition} onChange={(e) => setAiData({ ...aiData, nutrition: e.target.value })} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Water Saved</Label>
                      <Input value={aiData.waterSaved} onChange={(e) => setAiData({ ...aiData, waterSaved: e.target.value })} />
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Dish:</span>
                      <span className="font-medium text-foreground">{aiData.dish}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Est. Servings:</span>
                      <span className="font-medium text-foreground">{aiData.servings}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Allergens:</span>
                      <span className="font-medium text-foreground">{aiData.allergens}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Cuisine:</span>
                      <span className="font-medium text-foreground">{aiData.cuisine}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Apple className="h-3.5 w-3.5 text-primary" />
                      <span className="text-muted-foreground">Nutrition:</span>
                      <span className="font-medium text-foreground">{aiData.nutrition}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Droplets className="h-3.5 w-3.5 text-blue-500" />
                      <span className="text-muted-foreground">Water Saved:</span>
                      <span className="font-medium text-foreground">{aiData.waterSaved}</span>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
            </AnimatePresence>

            <motion.div whileTap={{ scale: 0.95 }} className="sm:self-end">
              <Button
                className="w-full gap-2 sm:w-auto"
                disabled={creating || !aiData.dish}
                onClick={handleCreateEvent}
              >
                {creating ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</>
                ) : (
                  <><Plus className="h-4 w-4" /> Create Event</>
                )}
              </Button>
            </motion.div>
          </CardContent>
        </Card>

        {/* Quick Tips */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Quick Tips</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm text-muted-foreground">
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="mb-1 font-medium text-foreground">Best Practices</p>
              <p>Photograph food in good lighting for more accurate AI analysis. Include a clear view of all items.</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="mb-1 font-medium text-foreground">Scheduling</p>
              <p>Set pickup windows at least 1 hour wide to give Passers flexibility.</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="mb-1 font-medium text-foreground">Packaging</p>
              <p>Use sealed, food-safe containers. Label any allergens clearly on the packaging.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Incoming Orders */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Incoming Orders
          </CardTitle>
          <CardDescription>Active orders placed against your donations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Dish</TableHead>
                  <TableHead>Servings</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingOrders ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center">
                      <div className="flex items-center justify-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading orders…
                      </div>
                    </TableCell>
                  </TableRow>
                ) : incomingOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      No active orders right now.
                    </TableCell>
                  </TableRow>
                ) : (
                  <AnimatePresence mode="popLayout">
                  {incomingOrders.map((order) => {
                    const s = getOrderStatusDisplay(order.status)
                    const isActive = ["pending", "volunteer_accepted", "picked_up"].includes(order.status)
                    return (
                      <motion.tr
                        key={order.id}
                        layout
                        variants={rowVariant}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        className="border-b transition-colors hover:bg-muted/50"
                      >
                        <TableCell className="font-mono text-xs">
                          {new Date(order.created_at).toLocaleDateString("en-CA")}
                        </TableCell>
                        <TableCell className="font-medium">{order.donations.dish_name}</TableCell>
                        <TableCell>{order.servings}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            {order.delivery_method === "delivery" ? (
                              <Truck className="h-3.5 w-3.5 text-primary" />
                            ) : (
                              <MapPin className="h-3.5 w-3.5 text-primary" />
                            )}
                            <span className="capitalize">{order.delivery_method}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={`${s.className} ${isActive ? "animate-pulse-slow" : ""}`}>
                            {s.label}
                          </Badge>
                        </TableCell>
                      </motion.tr>
                    )
                  })}
                  </AnimatePresence>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Donation History */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Donation History</CardTitle>
          <CardDescription>Your recent food donation events</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Dish</TableHead>
                  <TableHead>Servings</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingDonations ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      <div className="flex items-center justify-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading donations…
                      </div>
                    </TableCell>
                  </TableRow>
                ) : donations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      No donations yet. Create your first event above!
                    </TableCell>
                  </TableRow>
                ) : (
                  <AnimatePresence mode="popLayout">
                  {donations.map((item) => (
                    <motion.tr
                      key={item.id}
                      layout
                      variants={rowVariant}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      className="border-b transition-colors hover:bg-muted/50"
                    >
                      <TableCell className="font-mono text-xs">
                        {new Date(item.created_at).toLocaleDateString("en-CA")}
                      </TableCell>
                      <TableCell className="font-medium">{item.dish_name}</TableCell>
                      <TableCell>{item.servings}</TableCell>
                      <TableCell className="text-muted-foreground">{item.location}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={`${
                          item.status === "available"
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            : item.status === "cancelled"
                            ? "bg-red-500/10 text-red-700 dark:text-red-400"
                            : "bg-primary/10 text-primary"
                        } ${item.status === "available" ? "animate-pulse-slow" : ""}`}>
                          {item.status === "available" ? "Available" : item.status === "claimed" ? "Claimed" : item.status === "cancelled" ? "Cancelled" : item.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {item.status === "available" && (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-1 text-xs"
                              onClick={() => openEditDialog(item)}
                            >
                              <Pencil className="h-3 w-3" /> Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-1 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                              onClick={() => handleCancelDonation(item.id)}
                            >
                              <Ban className="h-3 w-3" /> Cancel
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </motion.tr>
                  ))}
                  </AnimatePresence>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Donation Dialog */}
      <Dialog open={!!editingDonation} onOpenChange={(open) => { if (!open) setEditingDonation(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Donation</DialogTitle>
            <DialogDescription>
              Update the servings or pickup window for &ldquo;{editingDonation?.dish_name}&rdquo;.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-servings">Servings</Label>
              <Input
                id="edit-servings"
                type="number"
                min={0}
                value={editForm.servings}
                onChange={(e) => setEditForm({ ...editForm, servings: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="edit-time-start">Pickup Start</Label>
                <Input
                  id="edit-time-start"
                  type="time"
                  value={editForm.timeStart}
                  onChange={(e) => setEditForm({ ...editForm, timeStart: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="edit-time-end">Pickup End</Label>
                <Input
                  id="edit-time-end"
                  type="time"
                  value={editForm.timeEnd}
                  onChange={(e) => setEditForm({ ...editForm, timeEnd: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingDonation(null)}>Cancel</Button>
            <Button disabled={saving} onClick={handleSaveEdit}>
              {saving ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
