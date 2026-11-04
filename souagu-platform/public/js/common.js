// API调用封装
const api = {
  async get(url) {
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '请求失败');
    }
    return res.json();
  },
  
  async post(url, data) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '请求失败');
    }
    return res.json();
  },
  
  async put(url, data) {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '请求失败');
    }
    return res.json();
  },
  
  async delete(url) {
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '请求失败');
    }
    return res.json();
  }
};

// 数字格式化
function fmt(n) {
  return Number(n).toLocaleString('en-US');
}

// 检查登录状态
async function checkAuth() {
  try {
    return await api.get('/api/auth/me');
  } catch (e) {
    return null;
  }
}

// 跳转到登录页
function redirectToLogin() {
  window.location.href = '/login';
}
