import axios from 'axios';

const API_URL = 'https://api.mail.tm';

export async function createTempMail() {
  try {
    // 1. Get domains
    const domainsResponse = await axios.get(`${API_URL}/domains`);
    const domain = domainsResponse.data['hydra:member'][0].domain;

    // 2. Generate random credentials
    const random = Math.random().toString(36).substring(7);
    const address = `${random}@${domain}`;
    const password = Math.random().toString(36).substring(10);

    // 3. Create account
    await axios.post(`${API_URL}/accounts`, {
      address,
      password
    });

    // 4. Get token
    const tokenResponse = await axios.post(`${API_URL}/token`, {
      address,
      password
    });

    return {
      email: address,
      password: password,
      token: tokenResponse.data.token
    };
  } catch (error: any) {
    console.error('Lỗi tạo mail:', error.response?.data || error.message);
    throw error;
  }
}

export async function checkInbox(token: string) {
  try {
    const response = await axios.get(`${API_URL}/messages`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    const messages = response.data['hydra:member'];
    
    return messages.map((m: any) => ({
      from: m.from.address,
      subject: m.subject,
      body: m.intro || 'No content preview'
    }));
  } catch (error: any) {
    console.error('Lỗi kiểm tra inbox:', error.response?.data || error.message);
    throw error;
  }
}
