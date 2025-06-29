// src/middleware.ts

import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { Database } from '@/types/database.types'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient<Database>({ req, res })

  const {
    data: { session },
  } = await supabase.auth.getSession()

  // 如果用户未登录，且试图访问 /dashboard 路径
  if (!session && req.nextUrl.pathname.startsWith('/dashboard')) {
    // 将用户重定向到主页（登录页）
    const redirectUrl = req.nextUrl.clone()
    redirectUrl.pathname = '/'
    return NextResponse.redirect(redirectUrl)
  }

  // 如果用户已登录，且试图访问主页（登录页）
  if (session && req.nextUrl.pathname === '/') {
    // 将用户重定向到仪表盘
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  return res
}

// 配置守卫要保护的路径
export const config = {
  matcher: ['/', '/dashboard'],
}