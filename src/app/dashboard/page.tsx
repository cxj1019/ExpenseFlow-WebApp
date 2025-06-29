// src/app/dashboard/page.tsx

'use client'

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'
import { useEffect, useState, FormEvent } from 'react'
import Link from 'next/link'
import type { Database } from '@/types/database.types'

type Report = Database['public']['Tables']['reports']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

export default function Dashboard() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [newReportTitle, setNewReportTitle] = useState('')
  const router = useRouter()
  const supabase = createClientComponentClient<Database>()

  const fetchReports = async (userId: string) => {
    const { data, error } = await supabase.from('reports').select('*').eq('user_id', userId).order('created_at', { ascending: false })
    if (error) { console.error('获取报销单列表失败:', error) } else { setReports(data) }
  }

  useEffect(() => {
    const getUserAndReports = async () => {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        setProfile(profileData)
        await fetchReports(user.id)
      } else {
        router.push('/')
      }
      setLoading(false)
    }
    getUserAndReports()
  }, [supabase, router])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const handleCreateReport = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!newReportTitle.trim() || !profile) return
    const { error } = await supabase.from('reports').insert({ title: newReportTitle, user_id: profile.id })
    if (error) { alert('创建报销单失败: ' + error.message) } else {
      setNewReportTitle('')
      await fetchReports(profile.id)
      alert('报销单创建成功！')
    }
  }

  if (loading) return <div className="flex justify-center items-center min-h-screen">正在加载...</div>

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow">
        <nav className="container mx-auto px-6 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-800">ExpenseFlow 仪表盘</h1>
          <div className="flex items-center space-x-4">
            {/* 【已修正】统一管理入口的显示逻辑 */}
            {profile?.role === 'manager' && (
              <Link href="/approval" className="px-4 py-2 text-white bg-purple-600 rounded-md hover:bg-purple-700">
                审批中心
              </Link>
            )}
            {profile?.role === 'partner' && (
              <>
                <Link href="/approval" className="px-4 py-2 text-white bg-purple-600 rounded-md hover:bg-purple-700">
                  审批中心
                </Link>
                <Link href="/analytics" className="px-4 py-2 text-white bg-indigo-600 rounded-md hover:bg-indigo-700">
                  费用分析
                </Link>
              </>
            )}
            {profile?.role === 'admin' && (
              <>
                <Link href="/approval" className="px-4 py-2 text-white bg-purple-600 rounded-md hover:bg-purple-700">
                  审批中心
                </Link>
                <Link href="/analytics" className="px-4 py-2 text-white bg-indigo-600 rounded-md hover:bg-indigo-700">
                  费用分析
                </Link>
                <Link href="/admin" className="px-4 py-2 text-white bg-gray-700 rounded-md hover:bg-gray-800">
                  系统管理
                </Link>
              </>
            )}
            <span className="text-gray-600">{profile?.full_name || profile?.id}</span>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-white bg-red-500 rounded-md hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              退出登录
            </button>
          </div>
        </nav>
      </header>
      <main className="container mx-auto p-6">
        <div className="bg-white p-6 rounded-lg shadow-md mb-8">
          <h2 className="text-2xl font-bold mb-4">创建新的报销单</h2>
          <form onSubmit={handleCreateReport}>
            <div className="mb-4">
              <label htmlFor="reportTitle" className="block text-gray-700 font-bold mb-2">
                报销事由 (例如: "5月北京出差")
              </label>
              <input
                id="reportTitle"
                type="text"
                value={newReportTitle}
                onChange={(e) => setNewReportTitle(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="请输入标题"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              创建
            </button>
          </form>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-2xl font-bold mb-4">我的报销单</h2>
          {reports.length > 0 ? (
            <ul className="space-y-4">
              {reports.map((report) => (
                <Link key={report.id} href={`/dashboard/report/${report.id}`}>
                  <li
                    className="p-4 border rounded-lg flex justify-between items-center hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    <div>
                      <p className="font-bold text-lg">{report.title}</p>
                      <p className="text-sm text-gray-500">
                        创建于: {new Date(report.created_at!).toLocaleString()}
                      </p>
                    </div>
                    <span
                      className={`px-3 py-1 text-sm font-semibold rounded-full ${
                        report.status === 'approved' ? 'bg-green-100 text-green-800' :
                        report.status === 'rejected' ? 'bg-red-100 text-red-800' :
                        report.status === 'submitted' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {report.status}
                    </span>
                  </li>
                </Link>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500">您还没有创建任何报销单。</p>
          )}
        </div>
      </main>
    </div>
  )
}
