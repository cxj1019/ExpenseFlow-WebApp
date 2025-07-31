// src/app/dashboard/report/[id]/page.tsx

'use client'

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useEffect, useState, FormEvent, ChangeEvent, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Database } from '@/types/database.types'
import type { User } from '@supabase/supabase-js'
import { pinyin } from 'pinyin-pro';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// --- 类型定义 ---
type Report = Database['public']['Tables']['reports']['Row']
type Expense = Database['public']['Tables']['expenses']['Row']
type Customer = Database['public']['Tables']['customers']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type SearchableOption = { id: number | string; name: string | null };

type ReportWithSubmitter = Report & {
  profiles: Profile | null;
};

type ReportDetailPageProps = {
  params: {
    id: string
  }
}

// 自定义费用类型，以解决类型定义文件可能未同步的问题
type ExpenseWithCustomerName = Expense & {
  customer_name?: string | null;
};
type ExpenseInsertWithCustomerName = Database['public']['Tables']['expenses']['Insert'] & {
  customer_name?: string | null;
  invoice_number?: string | null;
};


const EXPENSE_CATEGORIES = ['飞机', '火车', '长途汽车', 'Taxi', '餐饮', '住宿', '办公用品', '客户招待', '员工福利', '其他'];

// 【已修改】更新为您的 n8n Webhook URL
const N8N_WEBHOOK_URL = 'http://n8n.19851019.xyz:5678/webhook-test/7e18e6b7-c328-4e17-899c-3188a9b76083';

// ====================================================================
//  请求书 PDF 模板组件
// ====================================================================
const RequestFormPDF = ({ report, submitterName }: { report: ReportWithSubmitter | null, submitterName: string }) => {
  if (!report) return null;

  const formatDate = (dateString: string | null) => {
    if (!dateString) return { year: '', month: '', day: '' };
    const date = new Date(dateString);
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate()
    };
  };

  const { year, month, day } = formatDate(report.approved_at);

  return (
    <div className="p-8 bg-white text-black" style={{ width: '210mm', minHeight: '297mm', fontFamily: "'SimSun', 'STSong'" }}>
      <div className="text-center">
        <p className="text-lg font-bold">上海邁伊茲会計師事務所有限公司</p>
        <p className="text-sm">SHANGHAI MYTS CERTIFIED PUBLIC ACCOUNTANTS LTD.</p>
        <p className="text-xs mt-2">上海市徐汇区虹桥路1号港汇中心1座25楼 TEL：86(21)6407-8585 FAX：86(21)6448-3589</p>
        <p className="text-xs">(25F, 1 Grand Gateway, 1 Hongqiao Rd, Xuhui District, Shanghai 200030 China)</p>
      </div>

      <h1 className="text-center text-2xl font-bold my-8" style={{ letterSpacing: '0.5em' }}>請　求　書</h1>

      <div className="flex justify-end mb-4">
        <p>{`${year}年 ${month}月 ${day}日`}</p>
      </div>

      <div className="mb-4">
        <p className="border-b-2 border-black pb-1">{report.customer_name || '客户名称未填写'}　　　　御中</p>
      </div>

      <p className="mb-4">请根据以下请求，进行银行转账。</p>

      <table className="w-full border-collapse border border-black mb-4">
        <thead>
          <tr>
            <th className="border border-black p-2 font-normal">業務内容</th>
            <th className="border border-black p-2 font-normal" colSpan={2}>金額（通貨）</th>
            <th className="border border-black p-2 font-normal">请求金额</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-black p-2 h-32 align-top">{report.title}</td>
            <td className="border border-black p-2 text-center">RMB (含税)</td>
            <td className="border border-black p-2 text-right">{report.total_amount?.toFixed(2)}</td>
            <td className="border border-black p-2 text-right">{report.total_amount?.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>

      <p className="mb-4">请在收到请求书2周内，将以上金额转入下面的账户中。</p>

      <div className="space-y-2 text-sm">
        <p><span className="font-bold">收款方：</span> 上海迈伊兹会计师事务所有限公司 (SHANGHAI MYTS CERTIFIED PUBLIC ACCOUNTANTS LTD.)</p>
        <p><span className="font-bold">振込銀行：</span> 招商银行徐家汇支行 (CHINA MERCHANTS BANK SHANGHAI BRANCH XU JIA HUI SUB-BRANCH)</p>
        <p><span className="font-bold">口座番号：</span> 212885795610001（RMB）</p>
        <p><span className="font-bold">银行地址：</span> 上海市漕溪北路18号 实业大厦1楼 (1 INDUSTRIAL INVESTMENT BUILDING, 18 NORTH CAO XI RD., SHANGHAI CHINA)</p>
      </div>

      <div className="flex justify-end mt-8 text-sm">
        <p className="mr-16">业务担当：{submitterName}</p>
        <p>财务担当：马建萍</p>
      </div>
    </div>
  );
};


// ====================================================================
//  可交互的图片预览组件
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
  const [expenses, setExpenses] = useState<ExpenseWithCustomerName[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [selectedExpenseCustomer, setSelectedExpenseCustomer] = useState('');
  const [receiptFiles, setReceiptFiles] = useState<FileList | null>(null);
  const [isVatInvoice, setIsVatInvoice] = useState(false);
  const [taxRate, setTaxRate] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [reportCustomerName, setReportCustomerName] = useState('');
  const [reportBillToCustomer, setReportBillToCustomer] = useState(false);
  const [editableTitle, setEditableTitle] = useState('');
  const pdfRef = useRef<HTMLDivElement>(null);
  
  const [editingExpenseId, setEditingExpenseId] = useState<number | null>(null);
  const [editingExpenseData, setEditingExpenseData] = useState<Partial<ExpenseWithCustomerName>>({});
  
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState('');

  const supabase = createClientComponentClient<Database>();
  const router = useRouter();
  const reportId = params.id;

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
      const { data: status } = await supabase.rpc('get_report_status', { report_id_in: parseInt(reportId, 10) });

      if (status === 'draft') {
        setError('该报销单已被提交人撤回，无法访问。');
      } else {
        setError('无法加载报销单，或您无权访问。');
      }
      setReport(null);
      setLoading(false);
      return;
    }
    setReport(reportData as ReportWithSubmitter);
    setEditableTitle(reportData.title);
    setReportCustomerName(reportData.customer_name || '');
    setReportBillToCustomer(reportData.bill_to_customer || false);

    const { data: expensesData, error: expensesError } = expensesRes;
    if (expensesError) {
      setError('加载费用列表失败。');
    } else {
      setExpenses(expensesData);
    }

    setCustomers(customersRes.data || []);
    setLoading(false);
  }, [reportId, supabase, router]);

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
  
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const handleInvoiceRecognition = async (file: File) => {
    if (N8N_WEBHOOK_URL === '在此处粘贴您的 n8n Webhook 生产 URL') {
      alert('错误：尚未配置 n8n Webhook URL。请在代码中进行设置。');
      return;
    }
    
    setIsRecognizing(true);
    try {
      const base64Data = await fileToBase64(file);
      
      const response = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileData: base64Data,
          fileType: file.type,
        }),
      });

      if (!response.ok) {
        throw new Error(`n8n 工作流返回错误: ${response.statusText}`);
      }

      // 【已修改】接收并处理 n8n 返回的数据
      const resultText = await response.text();
      const result = JSON.parse(resultText); // 解析 Gemini 返回的 JSON 字符串

      console.log('从 n8n 收到的解析结果:', result);

      // 安全地更新状态
      if (result.category && EXPENSE_CATEGORIES.includes(result.category)) {
        setCategory(result.category);
      }
      if (result.date) {
        setExpenseDate(result.date);
      }
      if (result.amount) {
        setAmount(String(result.amount));
      }
      if (result.invoice_number) {
        setInvoiceNumber(result.invoice_number);
      }
      
      alert('发票识别成功！请核对信息后保存。');

    } catch (error: any) {
      console.error("AI 识别请求失败:", error);
      alert(`AI 识别失败: ${error.message}`);
    } finally {
      setIsRecognizing(false);
    }
  };


  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = e.target.files;
      setReceiptFiles(files);
      await handleInvoiceRecognition(files[0]);
    } else {
      setReceiptFiles(null);
    }
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
    const receiptUrls: string[] = [];

    if (receiptFiles && receiptFiles.length > 0) {
      for (const file of Array.from(receiptFiles)) {
        try {
          const presignResponse = await fetch('/api/upload-r2', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileType: file.type, userId: user.id }),
          });

          if (!presignResponse.ok) {
            const errorBody = await presignResponse.json();
            throw new Error(errorBody.error || '从服务器获取上传链接失败');
          }

          const { uploadUrl, accessUrl } = await presignResponse.json();

          const uploadResponse = await fetch(uploadUrl, {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': file.type },
          });

          if (!uploadResponse.ok) {
            throw new Error(`上传文件 ${file.name} 到 R2 失败`);
          }
          receiptUrls.push(accessUrl);

        } catch (error: any) {
          console.error("上传发票时出错:", error);
          alert(`上传发票时出错: ${error.message}。请检查浏览器控制台和服务器日志获取更多信息。`);
          setIsProcessing(false);
          return;
        }
      }
    }

    const insertData: ExpenseInsertWithCustomerName = {
      report_id: parseInt(reportId, 10),
      user_id: user.id,
      category,
      amount: parsedAmount,
      expense_date: expenseDate,
      description: description.trim() === '' ? null : description.trim(),
      customer_name: selectedExpenseCustomer.trim() === '' ? null : selectedExpenseCustomer.trim(),
      invoice_number: invoiceNumber || null,
      receipt_urls: receiptUrls.length > 0 ? receiptUrls : null,
      is_vat_invoice: isVatInvoice,
      tax_rate: parsedTaxRate,
    };

    const { error: insertError } = await supabase.from('expenses').insert(insertData);

    if (insertError) {
      alert('添加费用失败: ' + insertError.message);
    } else {
      setCategory(EXPENSE_CATEGORIES[0]);
      setAmount('');
      setDescription('');
      setSelectedExpenseCustomer('');
      setReceiptFiles(null);
      setIsVatInvoice(false);
      setTaxRate('');
      setInvoiceNumber('');
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
  
  const handleTitleUpdate = useCallback(async () => {
    if (!report || !editableTitle.trim() || report.title === editableTitle.trim()) {
      return;
    }
    setIsProcessing(true);
    const { data, error } = await supabase
      .from('reports')
      .update({ title: editableTitle.trim() })
      .eq('id', report.id)
      .select('*, profiles!user_id(*)')
      .single();
    setIsProcessing(false);

    if (error) {
      alert('标题更新失败: ' + error.message);
      setEditableTitle(report.title);
    } else {
      setReport(data as ReportWithSubmitter);
      alert('标题已更新！');
    }
  }, [report, editableTitle, supabase]);

  const handleDeleteExpense = async (expenseToDelete: Expense) => {
    if (!window.confirm(`您确定要删除这笔关于 “${expenseToDelete.category}” 的费用吗？`)) { return; }
    setIsProcessing(true);
    const { error: deleteError } = await supabase.from('expenses').delete().eq('id', expenseToDelete.id);
    if (deleteError) {
      alert('删除费用失败: ' + deleteError.message);
      setIsProcessing(false);
      return;
    }
    setExpenses(expenses.filter(expense => expense.id !== expenseToDelete.id));
    alert('费用已成功删除！');
    setIsProcessing(false);
  };

  const handleEditExpense = (expense: ExpenseWithCustomerName) => {
    setEditingExpenseId(expense.id);
    setEditingExpenseData({ ...expense });
  };

  const handleCancelEdit = () => {
    setEditingExpenseId(null);
    setEditingExpenseData({});
  };

  const handleUpdateExpense = async () => {
    if (!editingExpenseId || !editingExpenseData) return;

    setIsProcessing(true);
    const { id, report_id, user_id, created_at, receipt_urls, ...updateData } = editingExpenseData;

    const { error } = await supabase
      .from('expenses')
      .update(updateData)
      .eq('id', editingExpenseId);

    if (error) {
      alert('更新费用失败: ' + error.message);
    } else {
      alert('费用已更新！');
      handleCancelEdit();
      await fetchPageData();
    }
    setIsProcessing(false);
  };

  const handleWithdrawReport = async () => {
    if (!report || !user || user.id !== report.user_id) { alert('您无权执行此操作。'); return; }
    if (!['submitted', 'pending_partner_approval'].includes(report.status)) { alert('此状态下的报销单无法撤回。'); return; }
    setIsProcessing(true);
    const { data, error } = await supabase.from('reports').update({ status: 'draft' }).eq('id', parseInt(reportId, 10)).select().single();
    if (error) {
      alert('撤回失败: ' + error.message);
    } else {
      setReport(data as ReportWithSubmitter);
      alert('报销单已成功撤回，您可以继续编辑。');
    }
    setIsProcessing(false);
  };
  
  const handleSubmitForApproval = async () => {
    if (!report || report.status !== 'draft') { alert('报销单状态不正确，无法提交。'); return; }
    if (expenses.length === 0) { alert('报销单中没有任何费用，无法提交。'); return; }
    setIsProcessing(true);
    const { data, error } = await supabase.from('reports').update({ status: 'submitted', submitted_at: new Date().toISOString() }).eq('id', parseInt(reportId, 10)).select().single();
    if (error) {
      alert('提交失败: ' + error.message);
    } else {
      setReport(data as ReportWithSubmitter);
      alert('报销单已成功提交！');
    }
    setIsProcessing(false);
  };

  const handleDeleteReport = async () => {
    if (!report || !user || user.id !== report.user_id || report.status !== 'draft') {
      alert('只有您自己的、且处于草稿状态的报销单才能被删除。');
      return;
    }
    if (!window.confirm(`您确定要永久删除这个报销单 “${report.title}” 及其所有费用吗？此操作无法撤销。`)) {
      return;
    }
    setIsProcessing(true);
    const allReceiptPaths = expenses.map(e => e.receipt_urls).flat().filter(path => path !== null) as string[];
    const { error: deleteReportError } = await supabase.from('reports').delete().eq('id', parseInt(reportId, 10));
    if (deleteReportError) {
      alert('删除报销单失败: ' + deleteReportError.message);
      setIsProcessing(false);
      return;
    }
    alert('报销单已成功删除！');
    router.push('/dashboard');
    setIsProcessing(false);
  };

  const handleApprovalDecision = async (decision: 'approved' | 'send_back') => {
    if (!report || !currentUserProfile) return;
    
    setIsProcessing(true);
    const { data: currentReport, error: fetchError } = await supabase
      .from('reports')
      .select('status')
      .eq('id', report.id)
      .single();

    if (fetchError || !currentReport || !['submitted', 'pending_partner_approval'].includes(currentReport.status)) {
      alert('操作失败：该报销单已被提交人撤回或已被处理。');
      setIsProcessing(false);
      fetchPageData(); 
      return;
    }

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
      .select('*, profiles!user_id(*)')
      .single();

    if (error) {
      alert(`操作失败: ${error.message}`);
    } else {
      setReport(data as ReportWithSubmitter);
      alert(decision === 'send_back' ? '报销单已退回修改。' : '操作成功！');
    }
    setIsProcessing(false);
  };

  const handleGeneratePdf = async () => {
    const input = pdfRef.current;
    if (!input) return;

    try {
      const canvas = await html2canvas(input, {
        scale: 2,
        useCORS: true,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
      const imgX = (pdfWidth - imgWidth * ratio) / 2;
      const imgY = 0;

      pdf.addImage(imgData, 'PNG', imgX, imgY, imgWidth * ratio, imgHeight * ratio);
      pdf.save(`请求书-${report?.title || 'report'}.pdf`);
    } catch (error) {
      console.error('生成 PDF 失败:', error);
      alert('生成 PDF 失败，请检查控制台获取更多信息。');
    }
  };
  
  const isOwner = user?.id === report?.user_id;
  const isDraft = report?.status === 'draft';
  const canWithdraw = isOwner && ['submitted', 'pending_partner_approval'].includes(report?.status || '');
  
  const isApproverView =
    currentUserProfile &&
    !isOwner &&
    ['manager', 'partner', 'admin'].includes(currentUserProfile.role || '');

  const canApprove = 
    report &&
    isApproverView &&
    ['submitted', 'pending_partner_approval'].includes(report.status);
    
  const canExportPdf = report?.status === 'approved' && report.bill_to_customer;

  if (loading) return <div className="flex justify-center items-center min-h-screen">正在加载详情...</div>;
  
  if (error) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen text-center p-4 bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-md">
          <h2 className="text-2xl font-bold text-red-600 mb-4">无法访问</h2>
          <p className="text-gray-700 mb-6">{error}</p>
          <Link href="/approval" className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
            返回审批中心
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-gray-100">
        <header className="bg-white shadow-sm">
          <div className="container mx-auto px-6 py-4 flex justify-between items-start flex-wrap gap-4">
            <div>
              <Link href={isApproverView ? "/approval" : "/dashboard"} className="text-blue-600 hover:underline">
                &larr; {isApproverView ? "返回审批中心" : "返回仪表盘"}
              </Link>
              {isOwner && isDraft ? (
                <div className="mt-2">
                  <input
                    type="text"
                    value={editableTitle}
                    onChange={(e) => setEditableTitle(e.target.value)}
                    onBlur={handleTitleUpdate}
                    className="text-3xl font-bold text-gray-800 p-1 border-b-2 border-gray-200 focus:border-blue-500 outline-none w-full"
                    disabled={isProcessing}
                  />
                </div>
              ) : (
                <h1 className="text-3xl font-bold text-gray-800 mt-2">{report?.title}</h1>
              )}
              <p className="text-gray-500 mt-1">
                状态: <span className="font-semibold">{report?.status}</span>
                <span className="ml-4">提交人: {report?.profiles?.full_name || 'N/A'}</span>
              </p>
            </div>
            <div className="flex items-center space-x-2 flex-wrap">
              {canExportPdf && (
                <button onClick={handleGeneratePdf} className="px-4 py-2 font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                  导出请求书
                </button>
              )}
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
                <h2 className="text-2xl font-bold mb-4">客户信息 (用于请款)</h2>
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
                  <div>
                    <label htmlFor="expenseCustomer" className="block text-sm font-medium text-gray-700">客户名称 (费用归属)</label>
                    <SearchableSelect
                      placeholder="搜索客户名称"
                      options={customers}
                      value={selectedExpenseCustomer}
                      onChange={setSelectedExpenseCustomer}
                    />
                  </div>
                  <div><label htmlFor="description" className="block text-sm font-medium text-gray-700">备注 (可选)</label><textarea id="description" value={description} onChange={e => setDescription(e.target.value)} rows={2} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"></textarea></div>
                  <div className="space-y-2 p-3 border border-gray-200 rounded-md">
                    <div className="flex items-center"><input id="isVatInvoice" type="checkbox" checked={isVatInvoice} onChange={e => setIsVatInvoice(e.target.checked)} className="h-4 w-4 text-blue-600 border-gray-300 rounded"/><label htmlFor="isVatInvoice" className="ml-2 block text-sm text-gray-900">增值税专用发票</label></div>
                    {isVatInvoice && (<div><label htmlFor="taxRate" className="block text-sm font-medium text-gray-700">税率 (%)</label><input type="number" id="taxRate" value={taxRate} onChange={e => setTaxRate(e.target.value)} required={isVatInvoice} step="0.01" placeholder="例如: 9 或 6" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"/></div>)}
                  </div>
                  <div>
                    <label htmlFor="receipt" className="block text-sm font-medium text-gray-700">上传发票 (可选, 可多选)</label>
                    <input type="file" id="receipt" onChange={handleFileChange} accept="image/*" multiple className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
                    {isRecognizing && <p className="text-sm text-blue-600 mt-2">正在识别发票，请稍候...</p>}
                  </div>
                  <button type="submit" disabled={isProcessing || isRecognizing} className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400"> {isProcessing ? '正在处理...' : '添加费用'} </button>
                </form>
              </div>
            </div>
          ) : <div className="md:col-span-1"></div>}

          <div className={isDraft && isOwner ? "md:col-span-2" : "md:col-span-3"}>
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h2 className="text-2xl font-bold mb-4">费用明细</h2>
              {report?.customer_name && (
                <div className="mb-4 p-3 bg-indigo-50 rounded-md border border-indigo-200">
                  <p className="font-semibold text-indigo-800">请款客户: {report.customer_name}</p>
                  {report.bill_to_customer && <p className="text-sm text-indigo-700">此报销单整体需要向该客户请款。</p>}
                </div>
              )}
              <div className="space-y-3">
                {expenses.length > 0 ? expenses.map(expense => (
                  <div key={expense.id} className="p-3 border rounded-md">
                  {editingExpenseId === expense.id ? (
                    // --- 编辑表单 ---
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">费用类型</label>
                          <select 
                            value={editingExpenseData.category || ''}
                            onChange={(e) => setEditingExpenseData({...editingExpenseData, category: e.target.value})}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm"
                          >
                            {EXPENSE_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">金额</label>
                          <input 
                            type="number"
                            value={editingExpenseData.amount || ''}
                            onChange={(e) => setEditingExpenseData({...editingExpenseData, amount: parseFloat(e.target.value) || 0})}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">消费日期</label>
                          <input 
                            type="date"
                            value={editingExpenseData.expense_date || ''}
                            onChange={(e) => setEditingExpenseData({...editingExpenseData, expense_date: e.target.value})}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">客户名称 (费用归属)</label>
                           <SearchableSelect
                              placeholder="搜索客户名称"
                              options={customers}
                              value={editingExpenseData.customer_name || ''}
                              onChange={(name) => setEditingExpenseData({...editingExpenseData, customer_name: name})}
                            />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">备注</label>
                        <textarea 
                           value={editingExpenseData.description || ''}
                           onChange={(e) => setEditingExpenseData({...editingExpenseData, description: e.target.value})}
                           rows={2}
                           className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                        ></textarea>
                      </div>
                      <div className="flex justify-end space-x-2">
                        <button onClick={handleCancelEdit} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">取消</button>
                        <button onClick={handleUpdateExpense} disabled={isProcessing} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400">保存</button>
                      </div>
                    </div>
                  ) : (
                    // --- 静态显示 ---
                    <>
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-bold">{expense.category}</p>
                          {expense.customer_name && <p className="text-sm text-gray-500">客户名称: {expense.customer_name}</p>}
                          {expense.description && <p className="text-sm text-gray-500 italic">"{expense.description}"</p>}
                          <p className="text-sm text-gray-500">{new Date(expense.expense_date!).toLocaleDateString()}</p>
                          {expense.is_vat_invoice && <p className="text-xs font-semibold text-purple-600">专票 (税率: {expense.tax_rate}%)</p>}
                        </div>
                        <div className="flex flex-col items-end">
                          <p className="text-lg font-mono">¥{expense.amount?.toFixed(2)}</p>
                          {isDraft && isOwner && (
                            <div className="flex space-x-2 mt-1">
                               <button onClick={() => handleEditExpense(expense)} className="text-xs text-blue-500 hover:text-blue-700 hover:underline">修改</button>
                               <button onClick={() => handleDeleteExpense(expense)} disabled={isProcessing} className="text-xs text-red-500 hover:text-red-700 hover:underline disabled:text-gray-400">删除</button>
                            </div>
                          )}
                        </div>
                      </div>
                      {expense.receipt_urls && expense.receipt_urls.length > 0 && (
                        <div className="mt-2 pt-2 border-t flex flex-wrap gap-2">
                          {expense.receipt_urls.map((url, index) => (
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
                    </>
                  )}
                  </div>
                )) : (<p className="text-gray-500">此报销单下还没有任何费用。</p>)}
              </div>
            </div>
          </div>
        </main>
      </div>
      <div className="absolute -z-50 -left-[3000px]">
          <div ref={pdfRef}>
              <RequestFormPDF report={report} submitterName={report?.profiles?.full_name || ''} />
          </div>
      </div>
    </>
  );
}
