"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Leaf, UtensilsCrossed, Users, Truck, ArrowRight, ShieldCheck } from "lucide-react"
import { supabase } from "@/lib/supabase"

const heroStagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15 } },
} as const

const fadeSlideUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" as const } },
}

const cardStagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
} as const

const cardEntrance = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
}

const blobFloat = (delay: number) => ({
  y: [0, -20, 0],
  transition: {
    duration: 6,
    repeat: Infinity,
    repeatType: "mirror" as const,
    ease: "easeInOut" as const,
    delay,
  },
})

type RoleType = "restaurant" | "user" | "volunteer"

const ROLE_DISPLAY: Record<RoleType, string> = {
  restaurant: "a Plater",
  user: "an Eater",
  volunteer: "a Passer",
}

interface LandingViewProps {
  signInTrigger?: number
}

export function LandingView({ signInTrigger = 0 }: LandingViewProps) {
  const [agreementDialog, setAgreementDialog] = useState<"restaurant" | "volunteer" | null>(null)
  const [agreed, setAgreed] = useState(false)

  const [authDialog, setAuthDialog] = useState(false)
  const [authRole, setAuthRole] = useState<RoleType | null>(null)
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [authError, setAuthError] = useState("")
  const [authLoading, setAuthLoading] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState(false)

  function handleRoleClick(role: RoleType) {
    if (role === "user") {
      setAuthRole("user")
      setIsSignUp(false)
      setAuthDialog(true)
    } else {
      setAgreed(false)
      setAgreementDialog(role)
    }
  }

  function handleProceed() {
    if (agreed && agreementDialog) {
      setAuthRole(agreementDialog)
      setAgreementDialog(null)
      setAgreed(false)
      setIsSignUp(false)
      setAuthDialog(true)
    }
  }

  function resetAuthForm() {
    setEmail("")
    setPassword("")
    setAuthError("")
    setIsSignUp(false)
    setAuthRole(null)
    setAuthLoading(false)
    setConfirmEmail(false)
  }

  useEffect(() => {
    if (signInTrigger > 0) {
      setAuthRole(null)
      setIsSignUp(false)
      setAuthDialog(true)
    }
  }, [signInTrigger])

  async function handleAuth() {
    if (!email || !password) return
    if (isSignUp && !authRole) return
    setAuthError("")
    setAuthLoading(true)

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { role: authRole },
          },
        })
        if (error) {
          setAuthError(error.message)
          return
        }
        if (data.user && !data.session) {
          setConfirmEmail(true)
          return
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) {
          setAuthError(error.message)
          return
        }
      }
      setAuthDialog(false)
      resetAuthForm()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred"
      setAuthError(message)
    } finally {
      setAuthLoading(false)
    }
  }

  return (
    <div className="flex flex-col overflow-x-hidden">
      {/* Hero Section */}
      <section className="relative flex flex-col items-center justify-center px-6 py-32 text-center lg:py-44">
        <div className="absolute inset-0 bg-primary/10" />

        {/* Decorative blobs */}
        <motion.div
          className="pointer-events-none absolute left-0 top-0 h-[500px] w-[500px] -translate-x-1/3 -translate-y-1/4 rounded-full bg-green-400/30 blur-[120px]"
          animate={blobFloat(0)}
        />
        <motion.div
          className="pointer-events-none absolute right-0 top-1/4 h-[450px] w-[450px] translate-x-1/4 rounded-full bg-orange-300/30 blur-[120px]"
          animate={blobFloat(2)}
        />
        <motion.div
          className="pointer-events-none absolute bottom-0 left-1/2 h-[400px] w-[400px] -translate-x-1/2 translate-y-1/4 rounded-full bg-emerald-300/25 blur-[120px]"
          animate={blobFloat(4)}
        />

        <motion.div
          className="relative z-10 mx-auto max-w-3xl"
          variants={heroStagger}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={fadeSlideUp} className="mb-6 flex items-center justify-center gap-3">
            <Leaf className="h-10 w-10 text-primary md:h-11 md:w-11" />
            <span className="font-mono text-base font-bold uppercase tracking-widest text-primary md:text-lg">
              Plate Pass
            </span>
          </motion.div>
          <motion.h1 variants={fadeSlideUp} className="mb-6 text-balance text-4xl font-bold tracking-tight text-foreground md:text-6xl">
            Keep Food on Tables, Not in Landfills.
          </motion.h1>
          <motion.p variants={fadeSlideUp} className="mx-auto mb-10 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
            Billions of pounds of food are wasted annually while our neighbors go hungry.
            Plate Pass uses AI and community volunteers to rescue restaurant surplus
            before the doors close.
          </motion.p>
          <motion.div variants={fadeSlideUp}>
            <Button size="lg" className="gap-2" onClick={() => document.getElementById("roles")?.scrollIntoView({ behavior: "smooth" })}>
              Get Started <ArrowRight className="h-4 w-4" />
            </Button>
          </motion.div>
        </motion.div>
      </section>

      {/* Role Cards */}
      <section id="roles" className="px-6 pb-24 pt-32">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-3 text-center text-3xl font-bold text-foreground">Join as</h2>
          <p className="mx-auto mb-12 max-w-lg text-center text-muted-foreground">
            Choose your role and start making a difference today. Everyone has a part to play in reducing food waste.
          </p>
          <motion.div
            className="grid gap-6 md:grid-cols-3"
            variants={cardStagger}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
          >
            {/* Restaurant Card */}
            <motion.div variants={cardEntrance} whileHover={{ y: -5 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}>
              <Card
                className="flex h-full flex-col cursor-pointer border-2 border-transparent transition-colors hover:border-primary hover:shadow-lg"
                onClick={() => handleRoleClick("restaurant")}
              >
                <CardHeader className="pb-4">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    <UtensilsCrossed className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-xl">Plater</CardTitle>
                  <CardDescription>Donate surplus food and reduce waste from your kitchen.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col">
                  <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      AI-powered food analysis
                    </li>
                    <li className="flex items-start gap-2">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      Track your impact metrics
                    </li>
                    <li className="flex items-start gap-2">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      Easy donation scheduling
                    </li>
                  </ul>
                  <motion.div whileTap={{ scale: 0.95 }} className="mt-auto pt-6">
                    <Button className="w-full gap-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground" variant="outline">
                      Join as Plater <ArrowRight className="h-4 w-4" />
                    </Button>
                  </motion.div>
                </CardContent>
              </Card>
            </motion.div>

            {/* User Card */}
            <motion.div variants={cardEntrance} whileHover={{ y: -5 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}>
              <Card
                className="flex h-full flex-col cursor-pointer border-2 border-transparent transition-colors hover:border-eater-accent hover:shadow-lg"
                onClick={() => handleRoleClick("user")}
              >
                <CardHeader className="pb-4">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-eater-accent/10">
                    <Users className="h-6 w-6 text-eater-accent" />
                  </div>
                  <CardTitle className="text-xl">Eater</CardTitle>
                  <CardDescription>Browse available food near you and place orders for free meals.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col">
                  <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-eater-accent" />
                      Filter by cuisine & allergens
                    </li>
                    <li className="flex items-start gap-2">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-eater-accent" />
                      Pickup or delivery options
                    </li>
                    <li className="flex items-start gap-2">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-eater-accent" />
                      Real-time availability
                    </li>
                  </ul>
                  <motion.div whileTap={{ scale: 0.95 }} className="mt-auto pt-6">
                    <Button className="w-full gap-2 border-eater-accent text-eater-accent hover:bg-eater-accent hover:text-white" variant="outline">
                      Join as Eater <ArrowRight className="h-4 w-4" />
                    </Button>
                  </motion.div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Volunteer Card */}
            <motion.div variants={cardEntrance} whileHover={{ y: -5 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}>
              <Card
                className="flex h-full flex-col cursor-pointer border-2 border-transparent transition-colors hover:border-primary hover:shadow-lg"
                onClick={() => handleRoleClick("volunteer")}
              >
                <CardHeader className="pb-4">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    <Truck className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-xl">Passer</CardTitle>
                  <CardDescription>Drive surplus food to those in need and climb the leaderboard.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col">
                  <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      AI-optimized delivery routes
                    </li>
                    <li className="flex items-start gap-2">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      Social leaderboard
                    </li>
                    <li className="flex items-start gap-2">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      Flexible scheduling
                    </li>
                  </ul>
                  <motion.div whileTap={{ scale: 0.95 }} className="mt-auto pt-6">
                    <Button className="w-full gap-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground" variant="outline">
                      Join as Passer <ArrowRight className="h-4 w-4" />
                    </Button>
                  </motion.div>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Agreement Dialog */}
      <Dialog open={!!agreementDialog} onOpenChange={(open) => { if (!open) setAgreementDialog(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Food Safety & Liability Agreement</DialogTitle>
            <DialogDescription>
              Please review and accept the following terms before proceeding as a {agreementDialog === "restaurant" ? "Plater" : "Passer"}.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border bg-muted/50 p-4 text-sm leading-relaxed text-muted-foreground">
            <p className="mb-3">
              By joining Plate Pass as a {agreementDialog === "restaurant" ? "Plater" : "Passer"}, you agree to:
            </p>
            <ul className="flex flex-col gap-2">
              <li>1. Comply with all local food safety and handling regulations.</li>
              <li>2. Ensure donated food is fit for human consumption and properly stored.</li>
              <li>3. Hold Plate Pass harmless from any liability arising from food-related illness.</li>
              <li>4. Follow all platform guidelines for {agreementDialog === "restaurant" ? "food preparation and packaging" : "safe food transportation and delivery as a Passer"}.</li>
            </ul>
          </div>
          <div className="flex items-start gap-3 pt-2">
            <Checkbox
              id="agreement"
              checked={agreed}
              onCheckedChange={(checked) => setAgreed(checked === true)}
            />
            <label htmlFor="agreement" className="text-sm leading-relaxed text-foreground cursor-pointer">
              I have read and agree to the Food Safety & Liability Agreement.
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAgreementDialog(null)}>Cancel</Button>
            <Button disabled={!agreed} onClick={handleProceed}>
              Proceed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Auth Dialog */}
      <Dialog open={authDialog} onOpenChange={(open) => { if (!open) { setAuthDialog(false); resetAuthForm() } }}>
        <DialogContent className="sm:max-w-md">
          {confirmEmail ? (
            <>
              <DialogHeader>
                <DialogTitle>Check Your Email</DialogTitle>
                <DialogDescription>
                  We sent a confirmation link to <strong>{email}</strong>. Please confirm your email, then sign in below.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="flex-col gap-3 sm:flex-col">
                <Button
                  className="w-full"
                  onClick={() => {
                    setConfirmEmail(false)
                    setIsSignUp(false)
                    setPassword("")
                    setAuthError("")
                  }}
                >
                  Sign In
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{isSignUp ? "Create Your Account" : "Welcome Back"}</DialogTitle>
                <DialogDescription>
                  {isSignUp
                    ? `Sign up to join Plate Pass as ${authRole ? ROLE_DISPLAY[authRole] : "a member"}.`
                    : "Sign in to your existing Plate Pass account."}
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="auth-email">Email</Label>
                  <Input
                    id="auth-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setAuthError("") }}
                    onKeyDown={(e) => e.key === "Enter" && handleAuth()}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="auth-password">Password</Label>
                  <Input
                    id="auth-password"
                    type="password"
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setAuthError("") }}
                    onKeyDown={(e) => e.key === "Enter" && handleAuth()}
                  />
                </div>
                {authError && (
                  <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {authError}
                  </p>
                )}
              </div>
              <DialogFooter className="flex-col gap-3 sm:flex-col">
                <Button
                  className="w-full"
                  disabled={authLoading || !email || !password}
                  onClick={handleAuth}
                >
                  {authLoading ? "Please wait\u2026" : isSignUp ? "Sign Up" : "Sign In"}
                </Button>
                <button
                  type="button"
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => { setIsSignUp(!isSignUp); setAuthError("") }}
                >
                  {isSignUp ? "Already have an account? Sign in" : "Don\u2019t have an account? Sign up"}
                </button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
