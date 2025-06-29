// src/app/analytics/page.tsx

'use client'

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import * as XLSX from 'xlsx' // 导入 Excel 库
import type { Database } from '@/types/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']
// 定义一个更丰富的类型，包含报销单和审批人信息
type ExpenseWithDetails = Database['public']['Tables']['expenses']['Row'] & {
  profiles: Pick<Profile, 'full_name'> | null // 员工信息
  reports: {
    title: string | null
    submitted_at: string | null
    approved_at: string | null
    customer_name: string | null // 【已移动】客户名称现在在 reports 对象下
    bill_to_customer: boolean | null // 【已移动】是否向客户请款现在在 reports 对象下
    approver: Pick<Profile, 'full_name'> | null // 审批人信息
  } | null
}

export default function AnalyticsPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [filteredExpenses, setFilteredExpenses] = useState<ExpenseWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [isFetching, setIsFetching] = useState(false)

  // 筛选条件的状态
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [customer, setCustomer] = useState('');

  const router = useRouter()
  const supabase = createClientComponentClient<Database>()

  useEffect(() => {
    const checkRole = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return; }

      const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (!profileData || !['manager', 'partner'].includes(profileData.role)) {
        setProfile(profileData);
        setLoading(false);
        return;
      }
      setProfile(profileData)
      setLoading(false)
    }
    checkRole()
  }, [supabase, router])

  const handleFetchData = async () => {
    setIsFetching(true);
    let query = supabase
      .from('expenses')
      .select('*, profiles(full_name), reports!inner(*, approver:profiles!reports_approver_id_fkey(full_name))')
      .order('expense_date', { ascending: false });

    if (startDate) {
      query = query.gte('expense_date', startDate);
    }
    if (endDate) {
      query = query.lte('expense_date', endDate);
    }
    if (customer.trim() !== '') {
      // 【已修正】现在筛选 reports 表中的 customer_name
      query = query.ilike('reports.customer_name', `%${customer.trim()}%`);
    }

    const { data, error } = await query;

    if (error) {
      alert('查询费用数据失败: ' + error.message);
    } else {
      setFilteredExpenses(data as ExpenseWithDetails[]);
    }
    setIsFetching(false);
  };

  const handleExportToExcel = () => {
    if (filteredExpenses.length === 0) {
      alert('没有可导出的数据，请先查询。');
      return;
    }

    // 【已修正】从正确的 reports 对象中获取客户信息
    const dataToExport = filteredExpenses.map(exp => ({
      '费用日期': new Date(exp.expense_date!).toLocaleDateString(),
      '费用类型': exp.category,
      '金额': exp.amount,
      '员工': exp.profiles?.full_name || 'N/A',
      '客户': exp.reports?.customer_name || '-',
      '是否向客户请款': exp.reports?.bill_to_customer ? '是' : '否',
      '报销单名称': exp.reports?.title || 'N/A',
      '提交日期': exp.reports?.submitted_at ? new Date(exp.reports.submitted_at).toLocaleDateString() : '-',
      '审批通过日期': exp.reports?.approved_at ? new Date(exp.reports.approved_at).toLocaleDateString() : '-',
      '审批人': exp.reports?.approver?.full_name || '-',
      '费用ID': exp.id,
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '费用明细');

    XLSX.writeFile(workbook, `费用报表_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  if (loading) return <div className="flex justify-center items-center min-h-screen">正在加载...</div>;
  if (!profile || !['manager', 'partner'].includes(profile.role)) {
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
          <h1 className="text-xl font-bold text-gray-800">费用分析与导出</h1>
          <Link href="/dashboard" className="text-blue-600 hover:underline">返回仪表盘</Link>
        </nav>
      </header>
      <main className="container mx-auto p-6">
        {/* 筛选区域 */}
        <div className="bg-white p-6 rounded-lg shadow-md mb-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label htmlFor="startDate" className="block text-sm font-medium text-gray-700">开始日期</label>
              <input type="date" id="startDate" value={startDate} onChange={e => setStartDate(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"/>
            </div>
            <div>
              <label htmlFor="endDate" className="block text-sm font-medium text-gray-700">结束日期</label>
              <input type="date" id="endDate" value={endDate} onChange={e => setEndDate(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"/>
            </div>
            <div>
              <label htmlFor="customer" className="block text-sm font-medium text-gray-700">客户名称</label>
              <input type="text" id="customer" value={customer} onChange={e => setCustomer(e.target.value)} placeholder="可模糊查询" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"/>
            </div>
            <button onClick={handleFetchData} disabled={isFetching} className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400">
              {isFetching ? '查询中...' : '查询'}
            </button>
          </div>
        </div>

        {/* 结果区域 */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold">查询结果</h2>
            <button onClick={handleExportToExcel} disabled={filteredExpenses.length === 0} className="bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed">
              导出为 Excel
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">费用日期</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">类型</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">金额</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">员工</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">客户</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">向客户请款</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">报销单名称</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">提交日期</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">审批通过日期</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">审批人</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredExpenses.map(exp => (
                  <tr key={exp.id}>
                    {/* 【已修正】从正确的 reports 对象中获取客户信息 */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{new Date(exp.expense_date!).toLocaleDateString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{exp.category}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-mono">¥{exp.amount?.toFixed(2)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{exp.profiles?.full_name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{exp.reports?.customer_name || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{exp.reports?.bill_to_customer ? '是' : '否'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{exp.reports?.title}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{exp.reports?.submitted_at ? new Date(exp.reports.submitted_at).toLocaleDateString() : '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{exp.reports?.approved_at ? new Date(exp.reports.approved_at).toLocaleDateString() : '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{exp.reports?.approver?.full_name || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredExpenses.length === 0 && !isFetching && <p className="text-center text-gray-500 py-4">暂无数据，请通过上方条件进行查询。</p>}
          </div>
        </div>
      </main>
    </div>
  )
}
