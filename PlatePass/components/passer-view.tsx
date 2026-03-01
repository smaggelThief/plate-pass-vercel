"use client"

import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  Truck,
  Trophy,
  UserPlus,
  MapPin,
  Clock,
  Loader2,
  Package,
  CheckCircle2,
  Navigation,
  Sparkles,
  Route,
  UserCheck,
  X,
  Mail,
} from "lucide-react"
import { supabase } from "@/lib/supabase"

const cardItem = {
  initial: { opacity: 0, scale: 0.9 },
  animate: { opacity: 1, scale: 1, transition: { type: "spring" as const, stiffness: 300, damping: 25 } },
  exit: { opacity: 0, scale: 0.9, transition: { duration: 0.2 } },
}

const listItem = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 25 } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.2 } },
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

interface LeaderboardEntry {
  user_id: string
  email: string
  deliveries: number
  is_self: boolean
}

interface IncomingRequest {
  requester_id: string
  email: string
  created_at: string
}

function formatTimeWindow(start: string | null, end: string | null): string {
  if (!start || !end) return "Flexible"
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  return `${fmt(start)} \u2013 ${fmt(end)}`
}

function getActiveStatusDisplay(status: string) {
  switch (status) {
    case "volunteer_accepted":
      return { label: "Pick Up from Plater", className: "bg-blue-500/10 text-blue-700 dark:text-blue-400" }
    case "picked_up":
      return { label: "Deliver to Eater", className: "bg-violet-500/10 text-violet-700 dark:text-violet-400" }
    case "completed":
      return { label: "Delivered", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" }
    default:
      return { label: status, className: "bg-muted text-muted-foreground" }
  }
}

function emailToInitials(email: string): string {
  const local = email.split("@")[0]
  return local.slice(0, 2).toUpperCase()
}

function emailToName(email: string): string {
  return email.split("@")[0]
}

export function PasserView() {
  const [availableOrders, setAvailableOrders] = useState<OrderWithDonation[]>([])
  const [myDeliveries, setMyDeliveries] = useState<OrderWithDonation[]>([])
  const [loadingAvailable, setLoadingAvailable] = useState(true)
  const [loadingMine, setLoadingMine] = useState(true)
  const [acceptingId, setAcceptingId] = useState<string | null>(null)
  const [progressingId, setProgressingId] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState("time")

  const [totalDeliveries, setTotalDeliveries] = useState<number>(0)
  const [loadingStats, setLoadingStats] = useState(true)

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(true)

  const [addFriendOpen, setAddFriendOpen] = useState(false)
  const [friendEmail, setFriendEmail] = useState("")
  const [addingFriend, setAddingFriend] = useState(false)
  const [friendError, setFriendError] = useState("")
  const [friendSuccess, setFriendSuccess] = useState("")

  const [incomingRequests, setIncomingRequests] = useState<IncomingRequest[]>([])
  const [loadingRequests, setLoadingRequests] = useState(true)
  const [respondingTo, setRespondingTo] = useState<string | null>(null)

  const [aiRoute, setAiRoute] = useState<{
    routeOrder: string[]
    summary: string
    estimatedTime: string
  } | null>(null)
  const [loadingRoute, setLoadingRoute] = useState(false)
  const [acceptingRoute, setAcceptingRoute] = useState(false)

  const fetchTotalDeliveries = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { count, error } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("volunteer_id", user.id)
        .eq("status", "completed")

      if (!error && count !== null) setTotalDeliveries(count)
    } catch {
      // table may not exist yet
    } finally {
      setLoadingStats(false)
    }
  }, [])

  const fetchLeaderboard = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc("get_friends_leaderboard")
      if (!error && data) setLeaderboard(data as LeaderboardEntry[])
    } catch {
      // RPC may not exist yet
    } finally {
      setLoadingLeaderboard(false)
    }
  }, [])

  const fetchIncomingRequests = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc("get_incoming_requests")
      if (!error && data) setIncomingRequests(data as IncomingRequest[])
    } catch {
      // RPC may not exist yet
    } finally {
      setLoadingRequests(false)
    }
  }, [])

  const fetchAvailableOrders = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*, donations(dish_name, location, cuisine, allergens, pickup_start, pickup_end)")
        .eq("delivery_method", "delivery")
        .eq("status", "pending")
        .is("volunteer_id", null)
        .order("created_at", { ascending: false })

      if (!error && data) setAvailableOrders(data as OrderWithDonation[])
    } catch {
      // table may not exist yet
    } finally {
      setLoadingAvailable(false)
    }
  }, [])

  const fetchMyDeliveries = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from("orders")
        .select("*, donations(dish_name, location, cuisine, allergens, pickup_start, pickup_end)")
        .eq("volunteer_id", user.id)
        .in("status", ["volunteer_accepted", "picked_up"])
        .order("created_at", { ascending: false })

      if (!error && data) setMyDeliveries(data as OrderWithDonation[])
    } catch {
      // table may not exist yet
    } finally {
      setLoadingMine(false)
    }
  }, [])

  useEffect(() => {
    fetchAvailableOrders()
    fetchMyDeliveries()
    fetchTotalDeliveries()
    fetchLeaderboard()
    fetchIncomingRequests()
  }, [fetchAvailableOrders, fetchMyDeliveries, fetchTotalDeliveries, fetchLeaderboard, fetchIncomingRequests])

  useEffect(() => {
    if (loadingAvailable || availableOrders.length < 2) {
      setAiRoute(null)
      return
    }

    let cancelled = false
    async function optimizeRoute() {
      setLoadingRoute(true)
      try {
        const deliveries = availableOrders.slice(0, 4).map((o) => ({
          id: o.id,
          pickupLocation: o.donations.location,
          dropoffLocation: o.delivery_address ?? "Pickup (no address)",
          dishName: o.donations.dish_name,
        }))

        const res = await fetch("/api/optimize-route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deliveries }),
        })

        if (!res.ok) throw new Error("Route optimization failed")
        const data = await res.json()
        if (!cancelled) setAiRoute(data)
      } catch (err) {
        console.error("Route optimization error:", err)
        if (!cancelled) setAiRoute(null)
      } finally {
        if (!cancelled) setLoadingRoute(false)
      }
    }

    optimizeRoute()
    return () => { cancelled = true }
  }, [availableOrders, loadingAvailable])

  async function handleAccept(orderId: string) {
    setAcceptingId(orderId)

    const order = availableOrders.find(o => o.id === orderId)
    if (order) {
      setAvailableOrders(prev => prev.filter(o => o.id !== orderId))
      setMyDeliveries(prev => [{ ...order, status: "volunteer_accepted" }, ...prev])
    }

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      const { data, error } = await supabase
        .from("orders")
        .update({ volunteer_id: user.id, status: "volunteer_accepted" })
        .eq("id", orderId)
        .select()

      if (error) throw error
      if (!data || data.length === 0) throw new Error("Order may have already been claimed")

      await Promise.all([fetchAvailableOrders(), fetchMyDeliveries()])
    } catch (err) {
      console.error("Failed to accept delivery:", err)
      await Promise.all([fetchAvailableOrders(), fetchMyDeliveries()])
    } finally {
      setAcceptingId(null)
    }
  }

  async function handleProgressStatus(orderId: string, nextStatus: string) {
    setProgressingId(orderId)

    setMyDeliveries(prev =>
      nextStatus === "completed"
        ? prev.filter(o => o.id !== orderId)
        : prev.map(o => o.id === orderId ? { ...o, status: nextStatus } : o)
    )

    try {
      const { data, error } = await supabase
        .from("orders")
        .update({ status: nextStatus })
        .eq("id", orderId)
        .select()

      if (error) throw error
      if (!data || data.length === 0) throw new Error("Status update failed — insufficient permissions")

      await fetchMyDeliveries()
      if (nextStatus === "completed") {
        await Promise.all([fetchTotalDeliveries(), fetchLeaderboard()])
      }
    } catch (err) {
      console.error("Failed to update delivery status:", err)
      await fetchMyDeliveries()
    } finally {
      setProgressingId(null)
    }
  }

  async function handleSendRequest() {
    if (!friendEmail.trim()) return
    setAddingFriend(true)
    setFriendError("")
    setFriendSuccess("")

    try {
      const { error } = await supabase.rpc("send_friend_request", {
        p_email: friendEmail.trim(),
      })

      if (error) throw error

      setFriendSuccess("Request sent!")
      setFriendEmail("")
    } catch (err: unknown) {
      const e = err as { message?: string } | null
      setFriendError(e?.message || "Failed to send request")
    } finally {
      setAddingFriend(false)
    }
  }

  async function handleAcceptRequest(requesterId: string) {
    setRespondingTo(requesterId)
    try {
      const { error } = await supabase.rpc("accept_friend_request", {
        p_requester_id: requesterId,
      })
      if (error) throw error
      await Promise.all([fetchIncomingRequests(), fetchLeaderboard()])
    } catch (err) {
      console.error("Failed to accept request:", err)
    } finally {
      setRespondingTo(null)
    }
  }

  async function handleDeclineRequest(requesterId: string) {
    setRespondingTo(requesterId)
    try {
      const { error } = await supabase.rpc("decline_friend_request", {
        p_requester_id: requesterId,
      })
      if (error) throw error
      await fetchIncomingRequests()
    } catch (err) {
      console.error("Failed to decline request:", err)
    } finally {
      setRespondingTo(null)
    }
  }

  async function handleAcceptRoute() {
    if (!aiRoute) return
    setAcceptingRoute(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      const uniqueIds = [...new Set(
        aiRoute.routeOrder
          .map((s) => s.replace(/^(PICKUP|DROPOFF):/, ""))
      )]

      for (const orderId of uniqueIds) {
        const order = availableOrders.find((o) => o.id === orderId)
        if (!order) continue

        setAvailableOrders((prev) => prev.filter((o) => o.id !== orderId))
        setMyDeliveries((prev) => [{ ...order, status: "volunteer_accepted" }, ...prev])

        const { error } = await supabase
          .from("orders")
          .update({ volunteer_id: user.id, status: "volunteer_accepted" })
          .eq("id", orderId)

        if (error) console.error(`Failed to accept order ${orderId}:`, error)
      }

      setAiRoute(null)
      await Promise.all([fetchAvailableOrders(), fetchMyDeliveries()])
    } catch (err) {
      console.error("Failed to accept route:", err)
      await Promise.all([fetchAvailableOrders(), fetchMyDeliveries()])
    } finally {
      setAcceptingRoute(false)
    }
  }

  const sorted = [...availableOrders].sort((a, b) => {
    return (a.donations.pickup_start ?? "").localeCompare(b.donations.pickup_start ?? "")
  })

  const hasFriends = leaderboard.length > 1 || (leaderboard.length === 1 && !leaderboard[0].is_self)

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* ── Total Deliveries Stat ── */}
      <motion.div
        className="mb-8"
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Deliveries</CardTitle>
            <Truck className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold text-foreground">
              {loadingStats ? "…" : totalDeliveries}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Completed deliveries</p>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── My Active Deliveries ── */}
      {!loadingMine && myDeliveries.length > 0 && (
        <div className="mb-8">
          <div className="mb-4 flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">My Active Deliveries</h2>
            <Badge variant="secondary" className="ml-1">{myDeliveries.length}</Badge>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <AnimatePresence mode="popLayout">
            {myDeliveries.map((order) => {
              const s = getActiveStatusDisplay(order.status)
              const isProgressing = progressingId === order.id
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
                          <CardDescription className="mt-1">
                            {order.servings} serving{order.servings !== 1 ? "s" : ""}
                          </CardDescription>
                        </div>
                        <Badge variant="secondary" className={`${s.className} animate-pulse-slow`}>{s.label}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-col gap-3 text-sm">
                        <div className="rounded-lg border border-border bg-muted/30 p-3">
                          <p className="mb-1 text-xs font-medium text-muted-foreground">Pick up from</p>
                          <div className="flex items-center gap-2 text-foreground">
                            <MapPin className="h-3.5 w-3.5 text-primary" />
                            {order.donations.location}
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-muted-foreground">
                            <Clock className="h-3.5 w-3.5 text-primary" />
                            {formatTimeWindow(order.donations.pickup_start, order.donations.pickup_end)}
                          </div>
                        </div>
                        {order.delivery_address && (
                          <div className="rounded-lg border border-border bg-muted/30 p-3">
                            <p className="mb-1 text-xs font-medium text-muted-foreground">Deliver to</p>
                            <div className="flex items-center gap-2 text-foreground">
                              <Navigation className="h-3.5 w-3.5 text-primary" />
                              {order.delivery_address}
                            </div>
                          </div>
                        )}
                        {order.status === "volunteer_accepted" && (
                          <motion.div whileTap={{ scale: 0.95 }}>
                            <Button
                              className="w-full gap-1"
                              disabled={isProgressing}
                              onClick={() => handleProgressStatus(order.id, "picked_up")}
                            >
                              {isProgressing ? (
                                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Updating…</>
                              ) : (
                                <><CheckCircle2 className="h-3.5 w-3.5" /> Mark as Picked Up</>
                              )}
                            </Button>
                          </motion.div>
                        )}
                        {order.status === "picked_up" && (
                          <motion.div whileTap={{ scale: 0.95 }}>
                            <Button
                              className="w-full gap-1"
                              disabled={isProgressing}
                              onClick={() => handleProgressStatus(order.id, "completed")}
                            >
                              {isProgressing ? (
                                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Updating…</>
                              ) : (
                                <><CheckCircle2 className="h-3.5 w-3.5" /> Mark as Delivered</>
                              )}
                            </Button>
                          </motion.div>
                        )}
                      </div>
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

      {/* ── AI Suggested Route ── */}
      {(loadingRoute || aiRoute) && (
        <div className="mb-8">
          <Card className="border-primary/30 bg-primary/[0.02]">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-4 w-4 text-primary" />
                  AI Suggested Route
                </CardTitle>
                {aiRoute && (
                  <Badge variant="outline" className="gap-1 text-xs font-normal">
                    <Clock className="h-3 w-3" />
                    {aiRoute.estimatedTime}
                  </Badge>
                )}
              </div>
              {aiRoute && (
                <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                  <Route className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="font-medium">{aiRoute.summary}</span>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {loadingRoute ? (
                <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Optimizing route with AI…
                </div>
              ) : aiRoute ? (
                <div className="flex flex-col gap-3">
                  {aiRoute.routeOrder.map((stop, idx) => {
                    const isPickup = stop.startsWith("PICKUP:")
                    const orderId = stop.replace(/^(PICKUP|DROPOFF):/, "")
                    const order = availableOrders.find((o) => o.id === orderId)
                    if (!order) return null
                    const address = isPickup
                      ? order.donations.location
                      : order.delivery_address
                    return (
                      <div
                        key={`${stop}-${idx}`}
                        className={`flex items-start gap-3 rounded-lg border p-3 ${isPickup ? "border-primary/40 bg-primary/[0.03]" : "border-orange-400/40 bg-orange-50/30"}`}
                      >
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${isPickup ? "bg-primary" : "bg-orange-500"}`}>
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-foreground text-sm">
                            <Badge variant={isPickup ? "default" : "outline"} className={`mr-2 text-[10px] uppercase ${isPickup ? "bg-primary" : "border-orange-400 text-orange-600"}`}>
                              {isPickup ? "Pickup" : "Drop-off"}
                            </Badge>
                            {order.donations.dish_name}
                          </p>
                          <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                            {isPickup
                              ? <MapPin className="h-3 w-3 text-primary" />
                              : <Navigation className="h-3 w-3 text-orange-500" />}
                            {address}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                  <motion.div whileTap={{ scale: 0.95 }}>
                    <Button
                      className="mt-1 w-full gap-2"
                      disabled={acceptingRoute}
                      onClick={handleAcceptRoute}
                    >
                      {acceptingRoute ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> Accepting Route…</>
                      ) : (
                        <><Route className="h-4 w-4" /> Accept Entire Route</>
                      )}
                    </Button>
                  </motion.div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Incoming Friend Requests ── */}
      {!loadingRequests && incomingRequests.length > 0 && (
        <div className="mb-8">
          <Card className="border-amber-400/30 bg-amber-50/30">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Mail className="h-4 w-4 text-amber-600" />
                Friend Requests
                <Badge variant="secondary" className="ml-1 bg-amber-100 text-amber-700">{incomingRequests.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2">
                {incomingRequests.map((req) => {
                  const isResponding = respondingTo === req.requester_id
                  return (
                    <div
                      key={req.requester_id}
                      className="flex items-center gap-3 rounded-lg border border-border bg-background p-3"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs bg-amber-100 text-amber-700">
                          {emailToInitials(req.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{emailToName(req.email)}</p>
                        <p className="text-xs text-muted-foreground truncate">{req.email}</p>
                      </div>
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          className="h-8 gap-1 px-3"
                          disabled={isResponding}
                          onClick={() => handleAcceptRequest(req.requester_id)}
                        >
                          {isResponding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1 px-3"
                          disabled={isResponding}
                          onClick={() => handleDeclineRequest(req.requester_id)}
                        >
                          <X className="h-3.5 w-3.5" />
                          Decline
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Leaderboard + Delivery Feed ── */}
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Leaderboard */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Trophy className="h-4 w-4 text-accent" />
                Friends Leaderboard
              </CardTitle>
              <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => { setAddFriendOpen(true); setFriendError(""); setFriendSuccess(""); setFriendEmail("") }}>
                <UserPlus className="h-3 w-3" /> Add
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loadingLeaderboard ? (
              <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : !hasFriends ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Trophy className="mb-3 h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm font-medium text-muted-foreground">No friends yet</p>
                <p className="text-xs text-muted-foreground/70">Add friends to see how you compare!</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {leaderboard.map((person, idx) => {
                  const rank = idx + 1
                  const name = person.is_self ? "You" : emailToName(person.email)
                  const initials = person.is_self ? "ME" : emailToInitials(person.email)
                  return (
                    <div
                      key={person.user_id}
                      className={`flex items-center gap-3 rounded-lg p-2.5 ${
                        person.is_self
                          ? "border border-primary/30 bg-primary/5"
                          : "bg-muted/30"
                      }`}
                    >
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                        rank === 1
                          ? "bg-primary text-primary-foreground"
                          : rank === 2
                          ? "bg-accent/20 text-accent"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {rank}
                      </span>
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className={`text-xs ${person.is_self ? "bg-primary/10 text-primary" : ""}`}>
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">
                          {name}
                          {person.is_self && (
                            <Badge variant="secondary" className="ml-2 text-[10px]">You</Badge>
                          )}
                        </p>
                      </div>
                      <span className="font-mono text-sm font-semibold text-foreground">{person.deliveries}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Available Delivery Orders Feed ── */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base">Available Deliveries</CardTitle>
                <CardDescription className="mt-1">
                  {loadingAvailable
                    ? "Loading…"
                    : `${sorted.length} deliver${sorted.length === 1 ? "y" : "ies"} waiting`}
                </CardDescription>
              </div>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-full sm:w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="time">Sort by Time</SelectItem>
                  <SelectItem value="distance">Sort by Distance</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              {loadingAvailable ? (
                <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading deliveries…
                </div>
              ) : sorted.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Truck className="mb-3 h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm font-medium text-muted-foreground">No deliveries waiting right now</p>
                  <p className="text-xs text-muted-foreground/70">Check back soon — new orders come in throughout the day.</p>
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                {sorted.map((order) => {
                  const isAccepting = acceptingId === order.id
                  return (
                    <motion.div
                      key={order.id}
                      layout
                      variants={listItem}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      className="rounded-lg border border-border p-4 transition-colors hover:border-primary/30"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex-1">
                          <div className="mb-1 flex items-center gap-2">
                            <span className="font-semibold text-foreground">{order.donations.dish_name}</span>
                            <Badge variant="outline" className="text-xs">{order.servings} serving{order.servings !== 1 ? "s" : ""}</Badge>
                          </div>
                          <div className="mb-2 flex flex-col gap-1.5 text-sm">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <MapPin className="h-3.5 w-3.5 text-primary" />
                              <span className="font-medium text-foreground/80">Pickup:</span>
                              {order.donations.location}
                            </div>
                            {order.delivery_address && (
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <Navigation className="h-3.5 w-3.5 text-primary" />
                                <span className="font-medium text-foreground/80">Deliver to:</span>
                                {order.delivery_address}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3 text-primary" /> {formatTimeWindow(order.donations.pickup_start, order.donations.pickup_end)}
                            </span>
                          </div>
                        </div>
                        <motion.div whileTap={{ scale: 0.95 }}>
                          <Button
                            size="sm"
                            className="shrink-0 gap-1"
                            disabled={isAccepting}
                            onClick={() => handleAccept(order.id)}
                          >
                            {isAccepting ? (
                              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Accepting…</>
                            ) : (
                              "Accept Delivery"
                            )}
                          </Button>
                        </motion.div>
                      </div>
                    </motion.div>
                  )
                })}
                </AnimatePresence>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Send Friend Request Dialog ── */}
      <Dialog open={addFriendOpen} onOpenChange={setAddFriendOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Send Friend Request</DialogTitle>
            <DialogDescription>Enter a Passer&apos;s email to send them a friend request.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <Label htmlFor="friend-email">Email</Label>
            <Input
              id="friend-email"
              type="email"
              placeholder="friend@example.com"
              value={friendEmail}
              onChange={(e) => { setFriendEmail(e.target.value); setFriendError(""); setFriendSuccess("") }}
              onKeyDown={(e) => e.key === "Enter" && handleSendRequest()}
            />
            {friendError && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {friendError}
              </p>
            )}
            {friendSuccess && (
              <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
                {friendSuccess}
              </p>
            )}
          </div>
          <Separator />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddFriendOpen(false)}>Close</Button>
            <Button disabled={addingFriend || !friendEmail.trim()} onClick={handleSendRequest}>
              {addingFriend ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…</>
              ) : (
                "Send Request"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
