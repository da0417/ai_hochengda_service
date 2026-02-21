import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface UserState {
  line_user_id: string;
  nickname: string | null;
  community: string | null;
  role: string | null;
  is_registered: boolean;
  is_human_mode: boolean;
  last_human_interaction: string | null;
}

export default function UserList() {
  const [users, setUsers] = useState<UserState[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  async function fetchUsers() {
    setLoading(true);
    const { data } = await supabase
      .from('user_states')
      .select('*')
      .order('is_human_mode', { ascending: false });
    setUsers(data || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchUsers();
    // 每 30 秒自動刷新
    const interval = setInterval(fetchUsers, 30000);
    return () => clearInterval(interval);
  }, []);

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    return (
      (u.nickname || '').toLowerCase().includes(q) ||
      (u.community || '').toLowerCase().includes(q) ||
      (u.role || '').toLowerCase().includes(q)
    );
  });

  const roleColor: Record<string, string> = {
    '管委會委員': 'bg-purple-100 text-purple-700',
    '社區秘書': 'bg-blue-100 text-blue-700',
    '保全': 'bg-yellow-100 text-yellow-700',
    '工務經理': 'bg-green-100 text-green-700',
    '住戶': 'bg-gray-100 text-gray-700',
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">用戶列表</h1>
          <p className="text-sm text-gray-500 mt-1">共 {users.length} 位用戶</p>
        </div>
        <button
          onClick={fetchUsers}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          重新整理
        </button>
      </div>

      {/* 搜尋 */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="搜尋社區、姓名、身份..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">LINE 名稱</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">社區</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">身份</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">狀態</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">最後互動</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-gray-400">尚無用戶資料</td>
                </tr>
              ) : (
                filtered.map(user => (
                  <tr key={user.line_user_id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {user.nickname || <span className="text-gray-400">未知</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {user.community || <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-4 py-3">
                      {user.role ? (
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${roleColor[user.role] || 'bg-gray-100 text-gray-700'}`}>
                          {user.role}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">未完成登記</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {user.is_human_mode ? (
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">🔴 真人模式</span>
                      ) : user.is_registered ? (
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">✅ 正常</span>
                      ) : (
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">⏳ 登記中</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {user.last_human_interaction
                        ? new Date(user.last_human_interaction).toLocaleString('zh-TW')
                        : <span className="text-gray-300">-</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
