// src/app/dashboard/report/[id]/page.tsx

'use client'

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useEffect, useState, FormEvent, ChangeEvent, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Database } from '@/types/database.types'
import type { User } from '@supabase/supabase-js'
import { pinyin } from 'pinyin-pro';

// --- 类型定义 ---
type Report = Database['public']['Tables']['reports']['Row']
type Expense = Database['public']['Tables']['expenses']['Row']
type Customer = Database['public']['Tables']['customers']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type CostCenter = Database['public']['Tables']['cost_centers']['Row']
type SearchableOption = { id: number | string; name: string | null };

type ReportWithSubmitter = Report & {
  profiles: Profile | null;
};

type ReportDetailPageProps = {
  params: {
    id: string
  }
}

const EXPENSE_CATEGORIES = ['飞机', '火车', '长途汽车', 'Taxi', '餐饮', '住宿', '办公用品', '客户招待', '员工福利', '其他'];

// ====================================================================
//  最终版图片预览组件 (悬停触发、可固定、全功能交互)
// ====================================================================
const ImagePreview = ({ src, children }: { src: string; children: React.ReactNode }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [windowPosition, setWindowPosition] = useState({ x: 0, y: 0 });
  const [windowSize, setWindowSize] = useState({ width: 500, height: 600 });
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 });
  
  const [isWindowDragging, setIsWindowDragging] = useState(false);
  const [isImageDragging, setIsImageDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  
  const dragStart = useRef({ x: 0, y: 0 });
  const initialSize = useRef({ width: 0, height: 0 });
  const previewRef = useRef<HTMLDivElement>(null);
  const hideTimeout = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
    if (!isVisible) {
      const initialX = window.innerWidth / 2 - windowSize.width / 2;
      const initialY = window.innerHeight / 2 - windowSize.height / 2;
      setWindowPosition({ x: initialX > 0 ? initialX : 0, y: initialY > 0 ? initialY : 0 });
      setScale(1);
      setRotation(0);
      setImageOffset({ x: 0, y: 0 });
    }
    setIsVisible(true);
  };

  const handleMouseLeave = () => {
    if (!isWindowDragging && !isImageDragging && !isResizing) {
      hideTimeout.current = setTimeout(() => {
        setIsVisible(false);
      }, 300);
    }
  };

  const cancelHide = () => {
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsVisible(false);
  };
  
  const handleZoomIn = useCallback(() => setScale(s => s * 1.2), []);
  const handleZoomOut = useCallback(() => {
    setScale(s => {
      const newScale = s / 1.2;
      if (newScale <= 1) {
        setImageOffset({ x: 0, y: 0 });
        return 1;
      }
      return newScale;
    });
  }, []);
  const handleRotate = () => setRotation(r => (r + 90) % 360);

  const onWindowDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).dataset.resizeHandle || (e.target as HTMLElement).dataset.closeButton) return;
    e.preventDefault();
    setIsWindowDragging(true);
    dragStart.current = { x: e.clientX - windowPosition.x, y: e.clientY - windowPosition.y };
  };

  const onImageDragStart = (e: React.MouseEvent<HTMLImageElement>) => {
    if (scale <= 1) return;
    e.preventDefault();
    e.stopPropagation();
    setIsImageDragging(true);
    dragStart.current = { x: e.clientX - imageOffset.x, y: e.clientY - imageOffset.y };
  };

  const onResizeStart = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    if (previewRef.current) {
      initialSize.current = { width: previewRef.current.offsetWidth, height: previewRef.current.offsetHeight };
    }
  };

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (isWindowDragging) {
      setWindowPosition({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
    } else if (isImageDragging) {
      setImageOffset({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
    } else if (isResizing) {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setWindowSize({ width: initialSize.current.width + dx, height: initialSize.current.height + dy });
    }
  }, [isWindowDragging, isImageDragging, isResizing]);

  const onMouseUp = useCallback(() => {
    setIsWindowDragging(false);
    setIsImageDragging(false);
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isWindowDragging || isImageDragging || isResizing) {
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [isWindowDragging, isImageDragging, isResizing, onMouseMove, onMouseUp]);

  useEffect(() => {
    const previewElement = previewRef.current;
    if (!isVisible || !previewElement) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY < 0) handleZoomIn();
      else handleZoomOut();
    };
    previewElement.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      if (previewElement) previewElement.removeEventListener('wheel', handleWheel);
    };
  }, [isVisible, handleZoomIn, handleZoomOut]);

  return (
    <div onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} className="inline-block">
      {children}
      {isVisible && (
        <div
          ref={previewRef}
          onMouseEnter={cancelHide}
          className="fixed p-2 bg-white rounded-lg shadow-2xl z-50 flex flex-col"
          style={{
            top: windowPosition.y,
            left: windowPosition.x,
            width: `${windowSize.width}px`,
            height: `${windowSize.height}px`,
            minWidth: '250px',
            minHeight: '250px',
          }}
        >
          <div
            onMouseDown={onWindowDragStart}
            className="w-full h-6 bg-gray-100 rounded-t-md mb-2 flex-shrink-0 relative"
            style={{ cursor: isWindowDragging ? 'grabbing' : 'grab' }}
          >
            <button
              data-close-button="true"
              onClick={handleClose}
              className="absolute top-0 right-0 p-1 text-gray-500 hover:text-gray-800 hover:bg-gray-200 rounded-full"
              style={{ lineHeight: '1rem', height: '1.5rem', width: '1.5rem' }}
              title="关闭"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="overflow-hidden flex-grow relative">
            <img
              onMouseDown={onImageDragStart}
              src={src}
              alt="发票预览"
              className="absolute top-0 left-0 transition-transform duration-200"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                transform: `translateX(${imageOffset.x}px) translateY(${imageOffset.y}px) scale(${scale}) rotate(${rotation}deg)`,
                cursor: scale > 1 ? (isImageDragging ? 'grabbing' : 'grab') : 'default',
                pointerEvents: 'all',
              }}
            />
          </div>
          <div className="mt-2 flex justify-center items-center space-x-2 bg-gray-50 p-1 rounded-b-md flex-shrink-0">
            <button onClick={() => handleZoomOut()} title="缩小" className="p-1.5 text-gray-600 rounded hover:bg-gray-200"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" /></svg></button>
            <button onClick={() => handleZoomIn()} title="放大" className="p-1.5 text-gray-600 rounded hover:bg-gray-200"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" /></svg></button>
            <button onClick={handleRotate} title="旋转" className="p-1.5 text-gray-600 rounded hover:bg-gray-200"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M5.5 9.5a9 9 0 109 9" /></svg></button>
          </div>
          <div
            data-resize-handle="true"
            onMouseDown={onResizeStart}
            className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
          >
             <div className="w-full h-full border-r-2 border-b-2 border-gray-400 opacity-50"></div>
          </div>
        </div>
      )}
    </div>
  );
};


// 可搜索选择组件
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
              <li key={option.id} onClick={() => handleSelect(option.name || '')} className="px-3 py-2 cursor-pointer hover:bg-gray-100">
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
  const [report, setReport] = useState<ReportWithSubmitter | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string[]>>({});
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [receiptFiles, setReceiptFiles] = useState<FileList | null>(null);
  const [isVatInvoice, setIsVatInvoice] = useState(false);
  const [taxRate, setTaxRate] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [reportCustomerName, setReportCustomerName] = useState('');
  const [reportBillToCustomer, setReportBillToCustomer] = useState(false);

  const supabase = createClientComponentClient<Database>();
  const router = useRouter();
  const reportId = params.id;

  const generateSignedUrls = useCallback(async (expensesToProcess: Expense[]) => {
    const urls: Record<string, string[]> = {};
    for (const expense of expensesToProcess) {
      if (expense.receipt_urls && expense.receipt_urls.length > 0) {
        const expenseUrls: string[] = [];
        for (const path of expense.receipt_urls) {
          const { data } = await supabase.storage.from('receipts').createSignedUrl(path, 60 * 60);
          if (data) { expenseUrls.push(data.signedUrl); }
        }
        urls[expense.id] = expenseUrls;
      }
    }
    setSignedUrls(urls);
  }, [supabase]);

  const fetchPageData = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
    if (!user) {
      setLoading(false);
      router.push('/');
      return;
    }

    const [reportRes, expensesRes, customersRes, profileRes] = await Promise.all([
      supabase.from('reports').select('*, profiles!user_id(*)').eq('id', parseInt(reportId, 10)).single(),
      supabase.from('expenses').select('*').eq('report_id', parseInt(reportId, 10)).order('expense_date', { ascending: false }),
      supabase.from('customers').select('*').order('name', { ascending: true }),
      supabase.from('profiles').select('*').eq('id', user.id).single(),
    ]);

    setCurrentUserProfile(profileRes.data);

    const { data: reportData, error: reportError } = reportRes;
    if (reportError || !reportData) {
      setError('无法加载报销单，或您无权访问。');
      setReport(null);
      setLoading(false);
      return;
    }
    setReport(reportData as ReportWithSubmitter);
    setReportCustomerName(reportData.customer_name || '');
    setReportBillToCustomer(reportData.bill_to_customer || false);

    const { data: expensesData, error: expensesError } = expensesRes;
    if (expensesError) {
      setError('加载费用列表失败。');
    } else {
      setExpenses(expensesData);
      await generateSignedUrls(expensesData);
    }

    setCustomers(customersRes.data || []);
    setLoading(false);
  }, [reportId, supabase, router, generateSignedUrls]);

  useEffect(() => {
    fetchPageData();
  }, [fetchPageData]);

  useEffect(() => {
    if (category === '飞机' || category === '火车') {
      setIsVatInvoice(true); setTaxRate('9');
    } else {
      setIsVatInvoice(false); setTaxRate('');
    }
  }, [category]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    setReceiptFiles(e.target.files);
  };

  const handleAddExpense = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount)) { alert('请输入有效的金额！'); return; }

    let parsedTaxRate = null;
    if (isVatInvoice) {
      if (taxRate.trim() === '') { alert('选择了增值税专用发票，必须填写税率！'); return; }
      parsedTaxRate = parseFloat(taxRate);
      if (isNaN(parsedTaxRate)) { alert('请输入有效的税率！'); return; }
    }

    setIsProcessing(true);
    const receiptPaths: string[] = [];

    if (receiptFiles && receiptFiles.length > 0) {
      for (const file of Array.from(receiptFiles)) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}-${Date.now()}-${Math.random()}.${fileExt}`;
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
      amount: parsedAmount,
      expense_date: expenseDate,
      description: description.trim() === '' ? null : description.trim(),
      receipt_urls: receiptPaths.length > 0 ? receiptPaths : null,
      is_vat_invoice: isVatInvoice,
      tax_rate: parsedTaxRate,
    });

    if (insertError) {
      alert('添加费用失败: ' + insertError.message);
    } else {
      setCategory(EXPENSE_CATEGORIES[0]);
      setAmount('');
      setDescription('');
      setReceiptFiles(null);
      setIsVatInvoice(false);
      setTaxRate('');
      const fileInput = document.getElementById('receipt') as HTMLInputElement;
      if (fileInput) fileInput.value = "";
      
      await fetchPageData();
    }
    setIsProcessing(false);
  };

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
      setReport(data as ReportWithSubmitter);
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
    if (error) { alert('撤回失败: ' + error.message); } else { setReport(data as ReportWithSubmitter); alert('报销单已成功撤回，您可以继续编辑。'); }
    setIsProcessing(false);
  };
  
  const handleSubmitForApproval = async () => {
    if (!report || report.status !== 'draft') { alert('报销单状态不正确，无法提交。'); return; }
    if (expenses.length === 0) { alert('报销单中没有任何费用，无法提交。'); return; }
    setIsProcessing(true);
    const { data, error } = await supabase.from('reports').update({ status: 'submitted', submitted_at: new Date().toISOString() }).eq('id', parseInt(reportId, 10)).select().single();
    if (error) { alert('提交失败: ' + error.message); } else { setReport(data as ReportWithSubmitter); alert('报销单已成功提交！'); }
    setIsProcessing(false);
  };

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

  const handleApprovalDecision = async (decision: 'approved' | 'send_back') => {
    if (!report || !currentUserProfile) return;
    setIsProcessing(true);

    let newStatus: Report['status'];
    const updatePayload: Partial<Report> = {};

    if (decision === 'send_back') {
        newStatus = 'draft';
        updatePayload.status = newStatus;
    } else { // approved
        const totalAmount = report.total_amount || 0;
        if (
            totalAmount > 5000 &&
            (currentUserProfile.role === 'manager' || currentUserProfile.role === 'admin') &&
            report.status === 'submitted'
        ) {
            newStatus = 'pending_partner_approval';
        } else {
            newStatus = 'approved';
        }
        updatePayload.status = newStatus;
        updatePayload.approver_id = currentUserProfile.id;
        updatePayload.approved_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('reports')
      .update(updatePayload)
      .eq('id', report.id)
      .select()
      .single();

    if (error) {
      alert(`操作失败: ${error.message}`);
    } else {
      setReport(data as ReportWithSubmitter);
      alert(decision === 'send_back' ? '报销单已退回修改。' : '操作成功！');
    }
    setIsProcessing(false);
  };
  
  const isOwner = user?.id === report?.user_id;
  const isDraft = report?.status === 'draft';
  const canWithdraw = isOwner && ['submitted', 'pending_partner_approval'].includes(report?.status || '');

  const canApprove = 
    report &&
    currentUserProfile &&
    !isOwner && (
      ( (currentUserProfile.role === 'manager' || currentUserProfile.role === 'admin') && report.status === 'submitted' ) ||
      ( currentUserProfile.role === 'partner' && (report.status === 'submitted' || report.status === 'pending_partner_approval') )
    );

  if (loading) return <div className="flex justify-center items-center min-h-screen">正在加载详情...</div>;
  if (error) return <div className="flex justify-center items-center min-h-screen text-red-500">{error}</div>;

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm">
        <div className="container mx-auto px-6 py-4 flex justify-between items-start flex-wrap gap-4">
          <div>
            {/* 【已修改】动态返回按钮 */}
            <Link href={canApprove ? "/approval" : "/dashboard"} className="text-blue-600 hover:underline">
              &larr; {canApprove ? "返回审批中心" : "返回仪表盘"}
            </Link>
            <h1 className="text-3xl font-bold text-gray-800 mt-2">{report?.title}</h1>
            <p className="text-gray-500">
              状态: <span className="font-semibold">{report?.status}</span>
              <span className="ml-4">提交人: {report?.profiles?.full_name || 'N/A'}</span>
            </p>
          </div>
          <div className="flex items-center space-x-2">
            {canApprove && (
              <>
                <button onClick={() => handleApprovalDecision('approved')} disabled={isProcessing} className="px-4 py-2 font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:bg-gray-400">批准</button>
                <button onClick={() => handleApprovalDecision('send_back')} disabled={isProcessing} className="px-4 py-2 font-semibold text-white bg-gray-600 rounded-lg hover:bg-gray-700 disabled:bg-gray-400">退回修改</button>
              </>
            )}
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
                      {signedUrls[expense.id]?.map((url, index) => (
                        <ImagePreview key={url} src={url}>
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-500 hover:underline"
                          >
                            发票{index + 1}
                          </a>
                        </ImagePreview>
                      ))}
                    </div>
                  )}
                </div>
              )) : (<p className="text-gray-500">此报销单下还没有任何费用。</p>)}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
