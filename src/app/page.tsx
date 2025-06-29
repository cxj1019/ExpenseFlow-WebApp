'use client' // 明确这是一个客户端组件

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'

// 【已修正】我们直接在这里导入 Database 类型
import { Database } from '@/types/database.types'

export default function Home() {
  // 【已修正】这是为 App Router 设计的、最正确的创建客户端的方式
  // 我们在组件内部直接创建客户端实例
  const supabase = createClientComponentClient<Database>()

  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-100">
      <div className="w-full max-w-md p-8 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-bold text-center mb-6">报销系统登录</h2>
        <Auth
          supabaseClient={supabase}
          appearance={{ theme: ThemeSupa }}
          theme="light"
          providers={['github']}
          localization={{
            variables: {
              sign_in: {
                email_label: '邮箱地址',
                password_label: '密码',
                button_label: '登录',
                social_provider_text: '使用 {{provider}} 登录',
                link_text: '已经有账户了？登录',
              },
              sign_up: {
                email_label: '邮箱地址',
                password_label: '创建密码',
                button_label: '注册',
                social_provider_text: '使用 {{provider}} 注册',
                link_text: '还没有账户？注册',
              },
              forgotten_password: {
                email_label: '邮箱地址',
                button_label: '发送重置密码邮件',
                link_text: '忘记密码？',
              },
            },
          }}
        />
      </div>
    </div>
  )
}
