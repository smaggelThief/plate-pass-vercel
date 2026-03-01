"use client"

import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import {
  MapPin,
  Clock,
  UtensilsCrossed,
  Filter,
  Users,
  Truck,
  Loader2,
  Package,
  CheckCircle2,
} from "lucide-react"
import { supabase } from "@/lib/supabase"

const cardItem = {
  initial: { opacity: 0, scale: 0.9 },
  animate: { opacity: 1, scale: 1, transition: { type: "spring" as const, stiffness: 300, damping: 25 } },
  exit: { opacity: 0, scale: 0.9, transition: { duration: 0.2 } },
}

interface Donation {
  id: string
  restaurant_id: string
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

interface OrderWithDonation {
  id: string
  donation_id: string
  user_id: string
  volunteer_id: string | null
  servings: number
  delivery_method: string
  delivery_address: string | null
  status: string
  created_at: string
  updated_at: string
  donations: {
    dish_name: string
    location: string
    cuisine: string | null
    allergens: string | null
    pickup_start: string | null
    pickup_end: string | null
  }
}

function formatTimeWindow(start: string | null, end: string | null): string {
  if (!start || !end) return "Flexible"
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  return `${fmt(start)} \u2013 ${fmt(end)}`
}

function parseAllergens(raw: string | null): string[] {
  if (!raw) return []
  return raw.split(",").map((s) => s.trim()).filter(Boolean)
}

function getStatusDisplay(status: string, method: string) {
  switch (status) {
    case "pending":
      return method === "delivery"
        ? { label: "Awaiting Passer", className: "bg-amber-500/10 text-amber-700 dark:text-amber-400" }
        : { label: "Ready for Pickup", className: "bg-blue-500/10 text-blue-700 dark:text-blue-400" }
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

export function EaterView() {
  const [donations, setDonations] = useState<Donation[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedItem, setSelectedItem] = useState<Donation | null>(null)
  const [isDelivery, setIsDelivery] = useState(false)
  const [people, setPeople] = useState("1")
  const [confirming, setConfirming] = useState(false)
  const [cuisineFilter, setCuisineFilter] = useState("all")
  const [allergenFilter, setAllergenFilter] = useState("all")
  const [distanceFilter, setDistanceFilter] = useState("all")

  const [myOrders, setMyOrders] = useState<OrderWithDonation[]>([])
  const [loadingOrders, setLoadingOrders] = useState(true)
  const [deliveryAddress, setDeliveryAddress] = useState("")
  const [orderError, setOrderError] = useState<string | null>(null)

  const fetchAvailable = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("donations")
        .select("*")
        .eq("status", "available")
        .order("created_at", { ascending: false })

      if (!error && data) setDonations(data)
    } catch {
      // table may not exist yet
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchMyOrders = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from("orders")
        .select("*, donations(dish_name, location, cuisine, allergens, pickup_start, pickup_end)")
        .eq("user_id", user.id)
        .in("status", ["pending", "volunteer_accepted", "picked_up"])
        .order("created_at", { ascending: false })

      if (!error && data) setMyOrders(data as OrderWithDonation[])
    } catch {
      // table may not exist yet
    } finally {
      setLoadingOrders(false)
    }
  }, [])

  useEffect(() => {
    fetchAvailable()
    fetchMyOrders()
  }, [fetchAvailable, fetchMyOrders])

  const filtered = donations.filter((item) => {
    if (cuisineFilter !== "all" && item.cuisine !== cuisineFilter) return false
    if (allergenFilter !== "all" && parseAllergens(item.allergens).includes(allergenFilter)) return false
    return true
  })

  async function handleConfirmOrder() {
    if (!selectedItem) return
    setConfirming(true)
    setOrderError(null)

    try {
      const servingsCount = parseInt(people) || 1

      if (isDelivery && !deliveryAddress.trim()) {
        setOrderError("Please enter a delivery address.")
        setConfirming(false)
        return
      }

      const { error } = await supabase.rpc("place_order", {
        p_donation_id: selectedItem.id,
        p_servings: servingsCount,
        p_delivery_method: isDelivery ? "delivery" : "pickup",
        p_delivery_address: isDelivery ? deliveryAddress.trim() : null,
      })

      if (error) throw error

      setSelectedItem(null)
      setDeliveryAddress("")
      setOrderError(null)
      await Promise.all([fetchAvailable(), fetchMyOrders()])
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to place order. Please try again."
      console.error("Failed to place order:", err)
      setOrderError(message)
    } finally {
      setConfirming(false)
    }
  }

  async function handleCompletePickup(orderId: string) {
    const { error } = await supabase
      .from("orders")
      .update({ status: "completed" })
      .eq("id", orderId)
    if (!error) await fetchMyOrders()
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {!loadingOrders && myOrders.length > 0 && (
        <div className="mb-8">
          <div className="mb-4 flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">My Active Orders</h2>
            <Badge variant="secondary" className="ml-1">{myOrders.length}</Badge>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence mode="popLayout">
            {myOrders.map((order) => {
              const s = getStatusDisplay(order.status, order.delivery_method)
              const isActive = ["pending", "volunteer_accepted", "picked_up"].includes(order.status)
              return (
                <motion.div
                  key={order.id}
                  layout
                  variants={cardItem}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  <Card className="border-primary/20">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base">{order.donations.dish_name}</CardTitle>
                          <CardDescription className="mt-1 flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {order.donations.location}
                          </CardDescription>
                        </div>
                        <Badge variant="secondary" className={`${s.className} ${isActive ? "animate-pulse-slow" : ""}`}>{s.label}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Users className="h-3.5 w-3.5 text-primary" />
                          {order.servings} serving{order.servings !== 1 ? "s" : ""}
                        </div>
                        <div className="flex items-center gap-2">
                          {order.delivery_method === "delivery" ? (
                            <Truck className="h-3.5 w-3.5 text-primary" />
                          ) : (
                            <MapPin className="h-3.5 w-3.5 text-primary" />
                          )}
                          {order.delivery_method === "delivery" ? "Delivery" : "Pickup"}
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="h-3.5 w-3.5 text-primary" />
                          {formatTimeWindow(order.donations.pickup_start, order.donations.pickup_end)}
                        </div>
                        {order.delivery_address && (
                          <div className="flex items-center gap-2">
                            <MapPin className="h-3.5 w-3.5 text-primary" />
                            <span className="truncate">{order.delivery_address}</span>
                          </div>
                        )}
                      </div>
                      {order.delivery_method === "pickup" && order.status === "pending" && (
                        <motion.div whileTap={{ scale: 0.95 }}>
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-3 w-full gap-1"
                            onClick={() => handleCompletePickup(order.id)}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" /> Mark Picked Up
                          </Button>
                        </motion.div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })}
            </AnimatePresence>
          </div>
          <Separator className="mt-8" />
        </div>
      )}

      <Card className="mb-8">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Filter className="h-4 w-4 text-primary" />
              Filters
            </div>
            <div className="flex flex-1 flex-col gap-4 sm:flex-row">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">Cuisine</Label>
                <Select value={cuisineFilter} onValueChange={setCuisineFilter}>
                  <SelectTrigger className="w-full sm:w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Cuisines</SelectItem>
                    <SelectItem value="Asian">Asian</SelectItem>
                    <SelectItem value="Italian">Italian</SelectItem>
                    <SelectItem value="American">American</SelectItem>
                    <SelectItem value="Indian">Indian</SelectItem>
                    <SelectItem value="Mexican">Mexican</SelectItem>
                    <SelectItem value="Japanese">Japanese</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">Exclude Allergen</Label>
                <Select value={allergenFilter} onValueChange={setAllergenFilter}>
                  <SelectTrigger className="w-full sm:w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">No Filter</SelectItem>
                    <SelectItem value="Gluten">Gluten</SelectItem>
                    <SelectItem value="Dairy">Dairy</SelectItem>
                    <SelectItem value="Soy">Soy</SelectItem>
                    <SelectItem value="Fish">Fish</SelectItem>
                    <SelectItem value="Sesame">Sesame</SelectItem>
                    <SelectItem value="Eggs">Eggs</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">Max Distance</Label>
                <Select value={distanceFilter} onValueChange={setDistanceFilter}>
                  <SelectTrigger className="w-full sm:w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any Distance</SelectItem>
                    <SelectItem value="1mi">Under 1 mile</SelectItem>
                    <SelectItem value="2mi">Under 2 miles</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {loading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading available meals…
            </span>
          ) : (
            <>
              Showing <span className="font-semibold text-foreground">{filtered.length}</span> available meals near you
            </>
          )}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence mode="popLayout">
        {filtered.map((item) => {
          const allergens = parseAllergens(item.allergens)
          return (
            <motion.div
              key={item.id}
              layout
              variants={cardItem}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <Card
                role="button"
                tabIndex={0}
                className="group cursor-pointer transition-colors hover:border-primary/50 hover:shadow-md"
                onClick={() => { setSelectedItem(item); setIsDelivery(false); setPeople("1"); setOrderError(null); setDeliveryAddress("") }}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{item.dish_name}</CardTitle>
                      <CardDescription className="flex items-center gap-1 mt-1">
                        <UtensilsCrossed className="h-3 w-3" />
                        {item.location}
                      </CardDescription>
                    </div>
                    {item.cuisine && (
                      <Badge variant="secondary" className="shrink-0">{item.cuisine}</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-primary" />
                      {formatTimeWindow(item.pickup_start, item.pickup_end)}
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="h-3.5 w-3.5 text-primary" />
                      {item.servings} servings available
                    </div>
                  </div>
                  {allergens.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {allergens.map((a) => (
                        <Badge key={a} variant="outline" className="text-xs">
                          {a}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
        </AnimatePresence>
      </div>

      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <UtensilsCrossed className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <p className="text-lg font-medium text-muted-foreground">No meals match your filters</p>
          <p className="text-sm text-muted-foreground/70">Try adjusting the filters above to see more results.</p>
        </div>
      )}

      <Sheet open={!!selectedItem} onOpenChange={(open) => { if (!open) { setSelectedItem(null); setOrderError(null) } }}>
        <SheetContent className="overflow-y-auto">
          {selectedItem && (
            <>
              <SheetHeader>
                <SheetTitle>{selectedItem.dish_name}</SheetTitle>
                <SheetDescription>{selectedItem.location}</SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-6 px-4">
                <div className="flex flex-col gap-3 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-4 w-4 text-primary" />
                    {formatTimeWindow(selectedItem.pickup_start, selectedItem.pickup_end)}
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Users className="h-4 w-4 text-primary" />
                    {selectedItem.servings} servings available
                  </div>
                  {parseAllergens(selectedItem.allergens).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {parseAllergens(selectedItem.allergens).map((a) => (
                        <Badge key={a} variant="outline" className="text-xs">{a}</Badge>
                      ))}
                    </div>
                  )}
                </div>

                <Separator />

                <div className="flex flex-col gap-4">
                  <h3 className="font-semibold text-foreground">Place Order</h3>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="people">Number of Servings</Label>
                    <Input
                      id="people"
                      type="number"
                      min={1}
                      max={selectedItem.servings}
                      value={people}
                      onChange={(e) => setPeople(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Max {selectedItem.servings} servings available
                    </p>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-4">
                    <div className="flex items-center gap-2">
                      <Truck className="h-4 w-4 text-primary" />
                      <Label htmlFor="delivery-toggle" className="text-sm font-medium text-foreground cursor-pointer">
                        Delivery
                      </Label>
                    </div>
                    <Switch id="delivery-toggle" checked={isDelivery} onCheckedChange={setIsDelivery} />
                  </div>

                  {isDelivery ? (
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="delivery-address">Delivery Address</Label>
                        <div className="relative">
                          <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            id="delivery-address"
                            className="pl-10"
                            placeholder="110 David Hollowell Dr, Newark, DE"
                            value={deliveryAddress}
                            onChange={(e) => setDeliveryAddress(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="rounded-lg border border-border bg-muted/30 p-4">
                        <div className="flex items-center gap-2 text-sm">
                          <Truck className="h-4 w-4 text-primary" />
                          <span className="text-muted-foreground">Estimated delivery time:</span>
                          <span className="font-semibold text-foreground">25-35 min</span>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          A Passer will deliver to your location. You will receive a notification when they are on the way.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-border bg-muted/30 p-4">
                      <div className="flex flex-col gap-2 text-sm">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-primary" />
                          <span className="font-medium text-foreground">Pickup Address</span>
                        </div>
                        <p className="text-muted-foreground">{selectedItem.location}</p>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-primary" />
                          <span className="font-medium text-foreground">Pickup Window</span>
                        </div>
                        <p className="text-muted-foreground">
                          {formatTimeWindow(selectedItem.pickup_start, selectedItem.pickup_end)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {orderError && (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
                    {orderError}
                  </p>
                )}
              </div>
              <SheetFooter>
                <motion.div whileTap={{ scale: 0.95 }} className="w-full">
                  <Button
                    className="w-full"
                    size="lg"
                    disabled={confirming}
                    onClick={handleConfirmOrder}
                  >
                    {confirming ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Confirming…
                      </>
                    ) : (
                      <>Confirm Order for {people} {parseInt(people) === 1 ? "serving" : "servings"}</>
                    )}
                  </Button>
                </motion.div>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
