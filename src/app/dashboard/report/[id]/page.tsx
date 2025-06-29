// src/app/dashboard/report/[id]/page.tsx

'use client'

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useEffect, useState, FormEvent, ChangeEvent, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Database } from '@/types/database.types'
import type { User } from '@supabase/supabase-js'
// 导入 pinyin-pro 库，用于汉字转拼音及首字母搜索
import { pinyin } from 'pinyin-pro';

// --- 类型定义 ---
type Report = Database['public']['Tables']['reports']['Row']
type Expense = Database['public']['Tables']['expenses']['Row']
type Customer = Database['public']['Tables']['customers']['Row']
type CostCenter = Database['public']['Tables']['cost_centers']['Row']
type SearchableOption = { id: number | string; name: string | null };

type ReportDetailPageProps = {
  params: {
    id: string
  }
}

// 预设的费用类型
const EXPENSE_CATEGORIES = ['飞机', '火车', '长途汽车', 'Taxi', '餐饮', '住宿', '办公用品', '客户招待', '员工福利', '其他'];


// ====================================================================
//  新增：可搜索、支持拼音首字母的下拉选择组件
// ====================================================================
type SearchableSelectProps = {
  options: SearchableOption[];
  value: string;
  onChange: (newValue: string) => void;
  placeholder?: string;
};

const SearchableSelect = ({ options, value, onChange, placeholder }: SearchableSelectProps) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredOptions = query === ''
    ? options
    : options.filter(option => {
        const name = option.name || '';
        const lowerCaseQuery = query.toLowerCase();
        return (
          name.toLowerCase().includes(lowerCaseQuery) ||
          pinyin(name, { toneType: 'none' }).replace(/\s/g, '').toLowerCase().includes(lowerCaseQuery) ||
          pinyin(name, { pattern: 'first', toneType: 'none' }).replace(/\s/g, '').toLowerCase().includes(lowerCaseQuery)
        );
      });

  const handleSelect = (optionName: string) => {
    onChange(optionName);
    setQuery('');
    setIsOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <input
        type="text"
        value={isOpen ? query : value}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm"
      />
      {isOpen && (
        <ul className="absolute z-10 w-full bg-white border border-gray-300 rounded-md mt-1 max-h-60 overflow-y-auto shadow-lg">
          {filteredOptions.length > 0 ? (
            filteredOptions.map(option => (
              <li
                key={option.id}
                onClick={() => handleSelect(option.name || '')}
                className="px-3 py-2 cursor-pointer hover:bg-gray-100"
              >
                {option.name}
              </li>
            ))
          ) : (
            <li className="px-3 py-2 text-gray-500">无匹配项</li>
          )}
        </ul>
      )}
    </div>
  );
};


export default function ReportDetailPage({ params }: ReportDetailPageProps) {
  const [report, setReport] = useState<Report | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [signedUrls, setSignedUrls] = useState<Record<string, string[]>>({});
  
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);

  // 表单状态
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [costCenter, setCostCenter] = useState(''); 
  const [amount, setAmount] = useState('')
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0])
  const [description, setDescription] = useState('');
  const [receiptFiles, setReceiptFiles] = useState<FileList | null>(null)
  const [isVatInvoice, setIsVatInvoice] = useState(false);
  const [taxRate, setTaxRate] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const [reportCustomerName, setReportCustomerName] = useState('');
  const [reportBillToCustomer, setReportBillToCustomer] = useState(false);

  const supabase = createClientComponentClient<Database>()
  const router = useRouter();
  const reportId = params.id

  const generateSignedUrls = async (expensesToProcess: Expense[]) => {
    const urls: Record<string, string[]> = {};
    for (const expense of expensesToProcess) {
      if (expense.receipt_urls && expense.receipt_urls.length > 0) {
        const expenseUrls: string[] = [];
        for (const path of expense.receipt_urls) {
          const { data } = await supabase.storage.from('receipts').createSignedUrl(path, 60);
          if (data) { expenseUrls.push(data.signedUrl); }
        }
        urls[expense.id] = expenseUrls;
      }
    }
    setSignedUrls(urls);
  }

  const fetchPageData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);

    const [reportRes, expensesRes, customersRes, costCentersRes] = await Promise.all([
      supabase.from('reports').select('*').eq('id', parseInt(reportId, 10)).single(),
      supabase.from('expenses').select('*').eq('report_id', parseInt(reportId, 10)).order('expense_date', { ascending: false }),
      supabase.from('customers').select('*').order('name', { ascending: true }),
      supabase.from('cost_centers').select('*').order('name', { ascending: true })
    ]);

    const { data: reportData, error: reportError } = reportRes;
    if (reportError || !reportData) { setError('无法加载报销单，或您无权访问。'); setReport(null); return }
    setReport(reportData)
    setReportCustomerName(reportData.customer_name || '');
    setReportBillToCustomer(reportData.bill_to_customer || false);
    
    const { data: expensesData, error: expensesError } = expensesRes;
    if (expensesError) { setError('加载费用列表失败。') } 
    else { setExpenses(expensesData); await generateSignedUrls(expensesData) }

    setCustomers(customersRes.data || []);
    const fetchedCostCenters = costCentersRes.data || [];
    setCostCenters(fetchedCostCenters);

    if (fetchedCostCenters.length > 0 && fetchedCostCenters[0].name) {
      if (!costCenter) { // 仅在尚未选择时设置默认值
        setCostCenter(fetchedCostCenters[0].name);
      }
    }
  }

  useEffect(() => {
    setLoading(true)
    fetchPageData().finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (category === '飞机' || category === '火车') {
      setIsVatInvoice(true);
      setTaxRate('9');
    } else {
      setIsVatInvoice(false);
      setTaxRate('');
    }
  }, [category]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    setReceiptFiles(e.target.files);
  }

  const handleAddExpense = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!user) return
    if (!costCenter) { alert('请选择一个成本中心！'); return; }

    const parsedAmount = parseFloat(amount)
    if (isNaN(parsedAmount)) { alert('请输入有效的金额！'); return }

    let parsedTaxRate = null;
    if (isVatInvoice) {
      if (taxRate.trim() === '') {
        alert('选择了增值税专用发票，必须填写税率！');
        return;
      }
      parsedTaxRate = parseFloat(taxRate);
      if (isNaN(parsedTaxRate)) {
        alert('请输入有效的税率！');
        return;
      }
    }

    setIsProcessing(true)
    const receiptPaths: string[] = [];

    if (receiptFiles && receiptFiles.length > 0) {
      for (const file of Array.from(receiptFiles)) {
        const fileExt = file.name.split('.').pop()
        const fileName = `${user.id}-${Date.now()}-${Math.random()}.${fileExt}`
        const { error: uploadError } = await supabase.storage.from('receipts').upload(fileName, file);
        if (uploadError) {
          alert(`上传文件 ${file.name} 失败: ${uploadError.message}`);
          setIsProcessing(false);
          return;
        }
        receiptPaths.push(fileName);
      }
    }

    const { error: insertError } = await supabase.from('expenses').insert({
      report_id: parseInt(reportId, 10),
      user_id: user.id,
      category,
      cost_center: costCenter,
      amount: parsedAmount,
      expense_date: expenseDate,
      description: description.trim() === '' ? null : description.trim(),
      receipt_urls: receiptPaths.length > 0 ? receiptPaths : null,
      is_vat_invoice: isVatInvoice,
      tax_rate: parsedTaxRate,
    })

    if (insertError) {
      alert('添加费用失败: ' + insertError.message)
    } else {
      setCategory(EXPENSE_CATEGORIES[0]);
      if (costCenters.length > 0 && costCenters[0].name) {
        setCostCenter(costCenters[0].name);
      }
      setAmount('');
      setDescription('');
      setReceiptFiles(null);
      setIsVatInvoice(false);
      setTaxRate('');
      const fileInput = document.getElementById('receipt') as HTMLInputElement;
      if (fileInput) fileInput.value = "";
      
      await fetchPageData()
    }
    setIsProcessing(false)
  }

  const handleUpdateReportCustomerInfo = async () => {
    setIsProcessing(true);
    const { data, error } = await supabase
      .from('reports')
      .update({
        customer_name: reportCustomerName.trim() === '' ? null : reportCustomerName.trim(),
        bill_to_customer: reportBillToCustomer,
      })
      .eq('id', parseInt(reportId, 10))
      .select()
      .single();

    if (error) {
      alert('更新客户信息失败: ' + error.message);
    } else {
      setReport(data);
      alert('客户信息已更新！');
    }
    setIsProcessing(false);
  };

  const handleDeleteExpense = async (expenseToDelete: Expense) => {
    if (!window.confirm(`您确定要删除这笔关于 “${expenseToDelete.category}” 的费用吗？`)) { return; }
    setIsProcessing(true);
    const { error: deleteError } = await supabase.from('expenses').delete().eq('id', expenseToDelete.id);
    if (deleteError) { alert('删除费用失败: ' + deleteError.message); setIsProcessing(false); return; }
    if (expenseToDelete.receipt_urls && expenseToDelete.receipt_urls.length > 0) {
      const { error: storageError } = await supabase.storage.from('receipts').remove(expenseToDelete.receipt_urls);
      if (storageError) { alert('费用记录已删除，但清理关联发票时发生错误: ' + storageError.message); }
    }
    setExpenses(expenses.filter(expense => expense.id !== expenseToDelete.id));
    alert('费用已成功删除！');
    setIsProcessing(false);
  };

  const handleWithdrawReport = async () => {
    if (!report || !user || user.id !== report.user_id) { alert('您无权执行此操作。'); return; }
    if (!['submitted', 'pending_partner_approval'].includes(report.status)) { alert('此状态下的报销单无法撤回。'); return; }
    setIsProcessing(true);
    const { data, error } = await supabase.from('reports').update({ status: 'draft' }).eq('id', parseInt(reportId, 10)).select().single();
    if (error) { alert('撤回失败: ' + error.message); } else { setReport(data); alert('报销单已成功撤回，您可以继续编辑。'); }
    setIsProcessing(false);
  };
  
  const handleSubmitForApproval = async () => {
    if (!report || report.status !== 'draft') { alert('报销单状态不正确，无法提交。'); return; }
    if (expenses.length === 0) { alert('报销单中没有任何费用，无法提交。'); return; }
    setIsProcessing(true);
    const { data, error } = await supabase.from('reports').update({ status: 'submitted', submitted_at: new Date().toISOString() }).eq('id', parseInt(reportId, 10)).select().single();
    if (error) { alert('提交失败: ' + error.message); } else { setReport(data); alert('报销单已成功提交！'); }
    setIsProcessing(false);
  }

  const handleDeleteReport = async () => {
    if (!report || !user || user.id !== report.user_id || report.status !== 'draft') { alert('只有您自己的、且处于草稿状态的报销单才能被删除。'); return; }
    if (!window.confirm(`您确定要永久删除这个报销单 “${report.title}” 及其所有费用吗？此操作无法撤销。`)) { return; }
    setIsProcessing(true);
    const allReceiptPaths = expenses.map(e => e.receipt_urls).flat().filter(path => path !== null) as string[];
    const { error: deleteReportError } = await supabase.from('reports').delete().eq('id', parseInt(reportId, 10));
    if (deleteReportError) { alert('删除报销单失败: ' + deleteReportError.message); setIsProcessing(false); return; }
    if (allReceiptPaths.length > 0) {
      const { error: storageError } = await supabase.storage.from('receipts').remove(allReceiptPaths);
      if (storageError) { alert('报销单已删除，但清理部分关联发票时出错: ' + storageError.message); }
    }
    alert('报销单已成功删除！');
    router.push('/dashboard');
  };

  if (loading) return <div className="flex justify-center items-center min-h-screen">正在加载详情...</div>
  if (error) return <div className="flex justify-center items-center min-h-screen text-red-500">{error}</div>

  const isOwner = user?.id === report?.user_id;
  const isDraft = report?.status === 'draft';
  const canWithdraw = isOwner && ['submitted', 'pending_partner_approval'].includes(report?.status || '');

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm">
        <div className="container mx-auto px-6 py-4 flex justify-between items-start flex-wrap gap-4">
          <div>
            <Link href="/dashboard" className="text-blue-600 hover:underline">&larr; 返回仪表盘</Link>
            <h1 className="text-3xl font-bold text-gray-800 mt-2">{report?.title}</h1>
            <p className="text-gray-500">状态: <span className="font-semibold">{report?.status}</span></p>
          </div>
          <div className="flex items-center space-x-2">
            {canWithdraw && (<button onClick={handleWithdrawReport} disabled={isProcessing} className="px-4 py-2 font-semibold text-white bg-yellow-600 rounded-lg hover:bg-yellow-700 disabled:bg-gray-400"> {isProcessing ? '处理中...' : '撤回'} </button>)}
            {isOwner && isDraft && (
              <>
                <button onClick={handleSubmitForApproval} disabled={isProcessing || expenses.length === 0} className="px-4 py-2 font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:bg-gray-400" title={expenses.length === 0 ? "请先添加费用再提交" : ""}> {isProcessing ? '处理中...' : '提交审批'} </button>
                <button onClick={handleDeleteReport} disabled={isProcessing} className="px-4 py-2 font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:bg-gray-400"> {isProcessing ? '处理中...' : '删除'} </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto p-6 grid grid-cols-1 md:grid-cols-3 gap-8">
        {isDraft && isOwner ? (
          <div className="md:col-span-1">
            <div className="bg-white p-6 rounded-lg shadow-md mb-8">
              <h2 className="text-2xl font-bold mb-4">客户信息</h2>
              <div className="space-y-4">
                <div>
                  <label htmlFor="reportCustomerName" className="block text-sm font-medium text-gray-700">客户名称</label>
                  {/* -- 修改点: 使用新的 SearchableSelect 组件 -- */}
                  <SearchableSelect
                    placeholder="搜索客户名称或拼音"
                    options={customers}
                    value={reportCustomerName}
                    onChange={setReportCustomerName}
                  />
                </div>
                <div className="flex items-center">
                  <input id="reportBillToCustomer" type="checkbox" checked={reportBillToCustomer} onChange={e => setReportBillToCustomer(e.target.checked)} className="h-4 w-4 text-blue-600 border-gray-300 rounded"/>
                  <label htmlFor="reportBillToCustomer" className="ml-2 block text-sm text-gray-900">此报销单需向客户请款</label>
                </div>
                <button onClick={handleUpdateReportCustomerInfo} disabled={isProcessing} className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400">
                  {isProcessing ? '保存中...' : '保存客户信息'}
                </button>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md">
              <h2 className="text-2xl font-bold mb-4">添加一笔费用</h2>
              <form onSubmit={handleAddExpense} className="space-y-4">
                <div><label htmlFor="category" className="block text-sm font-medium text-gray-700">费用类型</label><select id="category" value={category} onChange={e => setCategory(e.target.value)} required className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm">{EXPENSE_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}</select></div>
                <div>
                  <label htmlFor="costCenter" className="block text-sm font-medium text-gray-700">成本中心</label>
                   {/* -- 修改点: 使用新的 SearchableSelect 组件 -- */}
                  <SearchableSelect
                    placeholder="搜索成本中心或拼音"
                    options={costCenters}
                    value={costCenter}
                    onChange={setCostCenter}
                  />
                </div>
                <div><label htmlFor="amount" className="block text-sm font-medium text-gray-700">金额</label><input type="number" id="amount" value={amount} onChange={e => setAmount(e.target.value)} required step="0.01" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"/></div>
                <div><label htmlFor="expenseDate" className="block text-sm font-medium text-gray-700">消费日期</label><input type="date" id="expenseDate" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"/></div>
                <div><label htmlFor="description" className="block text-sm font-medium text-gray-700">备注 (可选)</label><textarea id="description" value={description} onChange={e => setDescription(e.target.value)} rows={2} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"></textarea></div>
                <div className="space-y-2 p-3 border border-gray-200 rounded-md">
                  <div className="flex items-center"><input id="isVatInvoice" type="checkbox" checked={isVatInvoice} onChange={e => setIsVatInvoice(e.target.checked)} className="h-4 w-4 text-blue-600 border-gray-300 rounded"/><label htmlFor="isVatInvoice" className="ml-2 block text-sm text-gray-900">增值税专用发票</label></div>
                  {isVatInvoice && (<div><label htmlFor="taxRate" className="block text-sm font-medium text-gray-700">税率 (%)</label><input type="number" id="taxRate" value={taxRate} onChange={e => setTaxRate(e.target.value)} required={isVatInvoice} step="0.01" placeholder="例如: 9 或 6" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"/></div>)}
                </div>
                <div><label htmlFor="receipt" className="block text-sm font-medium text-gray-700">上传发票 (可选, 可多选)</label><input type="file" id="receipt" onChange={handleFileChange} accept="image/*" multiple className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/></div>
                <button type="submit" disabled={isProcessing} className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400"> {isProcessing ? '正在处理...' : '添加费用'} </button>
              </form>
            </div>
          </div>
        ) : <div className="md:col-span-1"></div>}

        <div className={isDraft && isOwner ? "md:col-span-2" : "md:col-span-3"}>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-2xl font-bold mb-4">费用明细</h2>
            {report?.customer_name && (
              <div className="mb-4 p-3 bg-indigo-50 rounded-md border border-indigo-200">
                <p className="font-semibold text-indigo-800">客户: {report.customer_name}</p>
                {report.bill_to_customer && <p className="text-sm text-indigo-700">此报销单整体需要向该客户请款。</p>}
              </div>
            )}
            <div className="space-y-3">
              {expenses.length > 0 ? expenses.map(expense => (
                <div key={expense.id} className="p-3 border rounded-md">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-bold">{expense.category}</p>
                      {expense.cost_center && <p className="text-sm text-gray-600">成本中心: {expense.cost_center}</p>}
                      {expense.description && <p className="text-sm text-gray-500 italic">"{expense.description}"</p>}
                      <p className="text-sm text-gray-500">{new Date(expense.expense_date!).toLocaleDateString()}</p>
                      {expense.is_vat_invoice && <p className="text-xs font-semibold text-purple-600">专票 (税率: {expense.tax_rate}%)</p>}
                    </div>
                    <div className="flex flex-col items-end">
                      <p className="text-lg font-mono">¥{expense.amount?.toFixed(2)}</p>
                      {isDraft && isOwner && (<button onClick={() => handleDeleteExpense(expense)} disabled={isProcessing} className="mt-1 text-xs text-red-500 hover:text-red-700 hover:underline disabled:text-gray-400"> 删除 </button>)}
                    </div>
                  </div>
                  {expense.receipt_urls && expense.receipt_urls.length > 0 && (
                    <div className="mt-2 pt-2 border-t flex flex-wrap gap-2">
                      {signedUrls[expense.id]?.map((url, index) => (<a key={url} href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-500 hover:underline"> 发票{index + 1} </a>))}
                    </div>
                  )}
                </div>
              )) : (<p className="text-gray-500">此报销单下还没有任何费用。</p>)}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
