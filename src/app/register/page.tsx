"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import bcrypt from "bcryptjs"

export default function RegisterPage() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")

    if (password !== confirmPassword) {
      setError("Passwords do not match")
      setIsLoading(false)
      return
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long")
      setIsLoading(false)
      return
    }

    try {
      const hashedPassword = await bcrypt.hash(password, 12)
      
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          password: hashedPassword,
        }),
      })

      if (response.ok) {
        router.push("/login?message=Account created successfully")
      } else {
        const data = await response.json()
        setError(data.error || "Something went wrong")
      }
    } catch (error) {
      setError("Something went wrong. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[--color-cream] dark:bg-black flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <Link href="/" className="inline-block">
            <Image src="/logo-pantrii.svg" alt="Pantrii" width={120} height={28} />
          </Link>
          <h2 className="mt-6 text-3xl font-bold text-stone-900 dark:text-white">
            Create your account
          </h2>
          <p className="mt-2 text-sm text-stone-600 dark:text-neutral-300">
            Or{" "}
            <Link
              href="/login"
              className="font-medium text-pantrii-600 hover:text-pantrii-500"
            >
              sign in to your existing account
            </Link>
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-2xl border border-black/5 dark:border-white/10 bg-white dark:bg-white/5 p-6 shadow-sm">
            <div className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-stone-700 dark:text-neutral-300">
                  Full name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-stone-300 dark:border-white/20 rounded-lg shadow-sm placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-pantrii-500 focus:border-pantrii-500 dark:bg-white/10 dark:text-white"
                  placeholder="Your full name"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-stone-700 dark:text-neutral-300">
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-stone-300 dark:border-white/20 rounded-lg shadow-sm placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-pantrii-500 focus:border-pantrii-500 dark:bg-white/10 dark:text-white"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-stone-700 dark:text-neutral-300">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-stone-300 dark:border-white/20 rounded-lg shadow-sm placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-pantrii-500 focus:border-pantrii-500 dark:bg-white/10 dark:text-white"
                  placeholder="Create a password"
                />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-stone-700 dark:text-neutral-300">
                  Confirm password
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-stone-300 dark:border-white/20 rounded-lg shadow-sm placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-pantrii-500 focus:border-pantrii-500 dark:bg-white/10 dark:text-white"
                  placeholder="Confirm your password"
                />
              </div>
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <div className="mt-6">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-pantrii-600 hover:bg-pantrii-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pantrii-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? "Creating account..." : "Create account"}
              </button>
            </div>
          </div>
        </form>

        <div className="text-center">
          <Link
            href="/"
            className="text-sm text-stone-600 dark:text-neutral-400 hover:text-stone-900 dark:hover:text-white"
          >
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  )
}
