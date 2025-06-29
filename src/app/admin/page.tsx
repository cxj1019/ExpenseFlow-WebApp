// src/app/admin/page.tsx
'use client'

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Database } from '@/types/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']
type Customer = Database['public']['Tables']['customers']['Row']
type CostCenter = Database['public']['Tables']['cost_centers']['Row']

// 管理实体类型
type ManageableEntity = Profile | Customer | CostCenter;
type ModalType = 'user' | 'customer' | 'cost_center';

export default function AdminPage() {
  const [adminProfile, setAdminProfile] = useState<Profile | null>(null)
  const [users, setUsers] = useState<Profile[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [costCenters, setCostCenters] = useState<CostCenter[]>([])
  const [loading, setLoading] = useState(true)
  
  // 模态框状态
  const [modalOpen, setModalOpen] = useState(false)
  const [modalType, setModalType] = useState<ModalType | null>(null)
  const [editingEntity, setEditingEntity] = useState<ManageableEntity | null>(null)
  const [formData, setFormData] = useState<Partial<ManageableEntity>>({})

  const router = useRouter()
  const supabase = createClientComponentClient<Database>()

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return; }

    const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (profileData?.role !== 'admin') {
      setAdminProfile(profileData); setLoading(false); return;
    }
    setAdminProfile(profileData)

    const [usersRes, customersRes, costCentersRes] = await Promise.all([
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('customers').select('*').order('name'),
      supabase.from('cost_centers').select('*').order('name'),
    ])
    
    setUsers(usersRes.data || [])
    setCustomers(customersRes.data || [])
    setCostCenters(costCentersRes.data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  const openModal = (type: ModalType, entity: ManageableEntity | null = null) => {
    setModalType(type)
    setEditingEntity(entity)
    setFormData(entity || {})
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setModalType(null)
    setEditingEntity(null)
    setFormData({})
  }

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!modalType) return;

    let error;

    // 【已修正】使用 switch 语句来处理不同的表操作，确保类型安全
    switch (modalType) {
      case 'user': {
        if (editingEntity) {
          const { id, email, ...updateData } = formData as Profile; // Profile 没有 created_at
          const { error: updateError } = await supabase.from('profiles').update(updateData).eq('id', (editingEntity as Profile).id);
          error = updateError;
        }
        break;
      }
      case 'customer': {
        const { id, created_at, ...updateData } = formData as Customer;
        if (editingEntity) {
          const { error: updateError } = await supabase.from('customers').update(updateData).eq('id', (editingEntity as Customer).id);
          error = updateError;
        } else {
          const { error: insertError } = await supabase.from('customers').insert(updateData);
          error = insertError;
        }
        break;
      }
      case 'cost_center': {
        const { id, created_at, ...updateData } = formData as CostCenter;
        if (editingEntity) {
          const { error: updateError } = await supabase.from('cost_centers').update(updateData).eq('id', (editingEntity as CostCenter).id);
          error = updateError;
        } else {
          const { error: insertError } = await supabase.from('cost_centers').insert(updateData);
          error = insertError;
        }
        break;
      }
      default:
        alert('未知的操作类型');
        return;
    }

    if (error) {
      alert(`操作失败: ${error.message}`)
    } else {
      alert('操作成功！')
      closeModal()
      await fetchData() // 重新获取数据刷新列表
    }
  }

  const handleDelete = async (type: ModalType, id: string | number) => {
    if (!window.confirm(`确定要删除这个${type}吗？`)) return;
    
    let error;

    // 【已修正】使用 switch 语句来处理不同的删除操作
    switch (type) {
        case 'user':
            alert('警告：这将只删除用户的 Profile 信息，不会删除其登录账户。如需彻底删除，请在 Supabase 后台操作。');
            const { error: userError } = await supabase.from('profiles').delete().eq('id', id as string);
            error = userError;
            break;
        case 'customer':
            const { error: customerError } = await supabase.from('customers').delete().eq('id', id as number);
            error = customerError;
            break;
        case 'cost_center':
            const { error: costCenterError } = await supabase.from('cost_centers').delete().eq('id', id as number);
            error = costCenterError;
            break;
        default:
            alert('未知的操作类型');
            return;
    }

    if (error) {
      alert(`删除失败: ${error.message}`)
    } else {
      alert('删除成功！')
      await fetchData()
    }
  }

  if (loading) return <div className="flex justify-center items-center min-h-screen">正在加载...</div>
  if (adminProfile?.role !== 'admin') {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen text-center">
        <h1 className="text-3xl font-bold text-red-600">访问被拒绝</h1>
        <p className="text-gray-600 mt-2">您没有管理员权限。</p>
        <Link href="/dashboard" className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">返回仪表盘</Link>
      </div>
    )
  }

  return (
    <>
      <div className="min-h-screen bg-gray-100">
        <header className="bg-white shadow">
          <nav className="container mx-auto px-6 py-4 flex justify-between items-center">
            <h1 className="text-xl font-bold text-gray-800">系统管理后台</h1>
            <Link href="/dashboard" className="text-blue-600 hover:underline">返回仪表盘</Link>
          </nav>
        </header>
        <main className="container mx-auto p-6 space-y-8">
          {/* 用户管理 */}
          <section className="bg-white p-6 rounded-lg shadow-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">用户管理</h2>
              <p className="text-sm text-gray-500">注意：此处无法创建或删除登录账户</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50"><tr><th className="p-2 text-left font-medium text-gray-500">姓名</th><th className="p-2 text-left font-medium text-gray-500">邮箱</th><th className="p-2 text-left font-medium text-gray-500">部门</th><th className="p-2 text-left font-medium text-gray-500">电话</th><th className="p-2 text-left font-medium text-gray-500">角色</th><th className="p-2"></th></tr></thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.id} className="border-b">
                      <td className="p-2">{user.full_name}</td><td className="p-2">{user.email}</td><td className="p-2">{user.department}</td><td className="p-2">{user.phone}</td><td className="p-2">{user.role}</td>
                      <td className="p-2 flex justify-end space-x-2"><button onClick={() => openModal('user', user)} className="text-blue-500 hover:underline">编辑</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 客户与成本中心管理 */}
          <div className="grid md:grid-cols-2 gap-8">
            <section className="bg-white p-6 rounded-lg shadow-md">
              <div className="flex justify-between items-center mb-4"><h2 className="text-2xl font-bold">客户管理</h2><button onClick={() => openModal('customer')} className="bg-blue-600 text-white px-3 py-1 rounded-md text-sm hover:bg-blue-700">新增</button></div>
              <ul>{customers.map(c => <li key={c.id} className="flex justify-between items-center py-2 border-b"><p>{c.name}</p><div className="space-x-4"><button onClick={() => openModal('customer', c)} className="text-blue-500 hover:underline text-sm">编辑</button><button onClick={() => handleDelete('customer', c.id)} className="text-red-500 hover:underline text-sm">删除</button></div></li>)}</ul>
            </section>
            <section className="bg-white p-6 rounded-lg shadow-md">
              <div className="flex justify-between items-center mb-4"><h2 className="text-2xl font-bold">成本中心管理</h2><button onClick={() => openModal('cost_center')} className="bg-blue-600 text-white px-3 py-1 rounded-md text-sm hover:bg-blue-700">新增</button></div>
              <ul>{costCenters.map(cc => <li key={cc.id} className="flex justify-between items-center py-2 border-b"><p>{cc.name}</p><div className="space-x-4"><button onClick={() => openModal('cost_center', cc)} className="text-blue-500 hover:underline text-sm">编辑</button><button onClick={() => handleDelete('cost_center', cc.id)} className="text-red-500 hover:underline text-sm">删除</button></div></li>)}</ul>
            </section>
          </div>
        </main>
      </div>

      {/* 通用模态框 */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
          <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md">
            <h3 className="text-xl font-bold mb-6">
              {editingEntity ? '编辑' : '新增'} 
              {modalType === 'user' ? '用户' : modalType === 'customer' ? '客户' : '成本中心'}
            </h3>
            <form onSubmit={handleFormSubmit} className="space-y-4">
              {modalType === 'user' && (
                <>
                  <div><label className="block text-sm font-medium text-gray-700">姓名</label><input name="full_name" value={(formData as Profile).full_name || ''} onChange={handleFormChange} className="w-full p-2 border rounded mt-1"/></div>
                  <div><label className="block text-sm font-medium text-gray-700">部门</label><input name="department" value={(formData as Profile).department || ''} onChange={handleFormChange} className="w-full p-2 border rounded mt-1"/></div>
                  <div><label className="block text-sm font-medium text-gray-700">电话</label><input name="phone" value={(formData as Profile).phone || ''} onChange={handleFormChange} className="w-full p-2 border rounded mt-1"/></div>
                  <div><label className="block text-sm font-medium text-gray-700">角色</label><select name="role" value={(formData as Profile).role || 'employee'} onChange={handleFormChange} className="w-full p-2 border rounded mt-1"><option value="employee">employee</option><option value="manager">manager</option><option value="partner">partner</option><option value="admin">admin</option></select></div>
                </> 
              )}
              {(modalType === 'customer' || modalType === 'cost_center') && (
                <div><label className="block text-sm font-medium text-gray-700">名称</label><input name="name" value={(formData as Customer).name || ''} onChange={handleFormChange} required className="w-full p-2 border rounded mt-1"/></div>
              )}
              <div className="flex justify-end space-x-4 pt-4">
                <button type="button" onClick={closeModal} className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300">取消</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">保存</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
