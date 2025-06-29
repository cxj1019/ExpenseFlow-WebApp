// src/app/approval/page.tsx

'use client'

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Database } from '@/types/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']
type Expense = Database['public']['Tables']['expenses']['Row']
type Report = Database['public']['Tables']['reports']['Row']
type ReportWithProfile = Report & {
  profiles: Profile | null
  expenses: Expense[]
}

export default function ApprovalPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [pendingReports, setPendingReports] = useState<ReportWithProfile[]>([])
  const [processedReports, setProcessedReports] = useState<ReportWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClientComponentClient<Database>()

  const fetchReports = async (userRole: string, userId: string) => {
    const baseSelect = '*, profiles!user_id(*), expenses(*)'
    
    // 获取待处理报销单
    const pendingQuery = supabase
      .from('reports')
      .select(baseSelect)
      .neq('user_id', userId) 
      .order('submitted_at', { ascending: true });

    if (userRole === 'manager' || userRole === 'admin') {
      pendingQuery.eq('status', 'submitted');
    } else if (userRole === 'partner') {
      pendingQuery.in('status', ['submitted', 'pending_partner_approval']);
    }

    const { data: pendingData, error: pendingError } = await pendingQuery;
    if (pendingError) {
      console.error('获取待审批列表失败:', pendingError);
    } else {
      setPendingReports(pendingData as ReportWithProfile[]);
    }

    // 获取已处理报销单
    const { data: processedData, error: processedError } = await supabase
      .from('reports')
      .select(baseSelect)
      .eq('approver_id', userId) // 只看自己处理过的
      .in('status', ['approved', 'rejected'])
      .order('approved_at', { ascending: false, nullsFirst: false })
      .limit(20);
      
    if (processedError) {
      console.error('获取已审批列表失败:', processedError);
    } else {
      setProcessedReports(processedData as ReportWithProfile[]);
    }
  };

  useEffect(() => {
    const checkRoleAndFetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }

      const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (!profileData || !['manager', 'partner', 'admin'].includes(profileData.role)) {
        setProfile(profileData);
        setLoading(false);
        return;
      }
      setProfile(profileData);
      await fetchReports(profileData.role, user.id);
      setLoading(false);
    };
    checkRoleAndFetchData();
  }, [supabase, router]);

  if (loading) return <div className="flex justify-center items-center min-h-screen">正在加载...</div>;
  if (!profile || !['manager', 'partner', 'admin'].includes(profile.role)) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen text-center">
        <h1 className="text-3xl font-bold text-red-600">访问被拒绝</h1>
        <p className="text-gray-600 mt-2">您没有权限访问此页面。</p>
        <Link href="/dashboard" className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">返回仪表盘</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow">
        <nav className="container mx-auto px-6 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-800">审批中心 ({profile.role})</h1>
          <Link href="/dashboard" className="text-blue-600 hover:underline">返回仪表盘</Link>
        </nav>
      </header>
      <main className="container mx-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* 待我审批 */}
        <section>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-2xl font-bold mb-4">待我审批</h2>
            {pendingReports.length > 0 ? (
              <div className="space-y-4">
                {pendingReports.map(report => (
                  <Link href={`/dashboard/report/${report.id}`} key={report.id}>
                    <div className="p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
                      <p className="font-bold text-lg">{report.title}</p>
                      <div className="text-sm text-gray-600 my-2">
                        {/* 【已修改】移除角色显示 */}
                        <p>提交人: {report.profiles?.full_name || 'N/A'}</p>
                        <p>总金额: <span className="font-mono">¥{report.total_amount?.toFixed(2) || '0.00'}</span></p>
                        {report.status === 'pending_partner_approval' && <p className="text-orange-500 font-bold">需合伙人终审</p>}
                      </div>
                      <div className="flex justify-end items-center mt-2">
                        <span className="text-blue-600 hover:underline">前往审批 &rarr;</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : <p className="text-gray-500">当前没有待您审批的报销单。</p>}
          </div>
        </section>
        {/* 已审批历史 */}
        <section>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-2xl font-bold mb-4">我处理过的报销单</h2>
            {processedReports.length > 0 ? (
              <div className="space-y-4">
                {processedReports.map(report => (
                  <Link href={`/dashboard/report/${report.id}`} key={report.id}>
                    <div className="p-4 border rounded-lg hover:bg-gray-50 cursor-pointer flex justify-between items-center">
                      <div>
                        <p className="font-bold">{report.title}</p>
                        <p className="text-sm text-gray-500">提交人: {report.profiles?.full_name}</p>
                      </div>
                      <span className={`px-3 py-1 text-sm font-semibold rounded-full ${
                        report.status === 'approved' ? 'bg-green-100 text-green-800' :
                        report.status === 'rejected' ? 'bg-red-100 text-red-800' :
                        'bg-orange-100 text-orange-800'
                      }`}>
                        {report.status}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : <p className="text-gray-500">您还没有处理过任何报销单。</p>}
          </div>
        </section>
      </main>
    </div>
  );
}
