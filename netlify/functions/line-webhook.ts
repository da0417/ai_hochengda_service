import { Handler } from '@netlify/functions';
import { Client, validateSignature, WebhookEvent } from '@line/bot-sdk';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fetch from 'node-fetch';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const { data: settings, error: settingsError } = await supabase.from('settings').select('*').single();
  if (settingsError || !settings) return { statusCode: 500, body: 'Failed to fetch settings' };

  const lineClient = new Client({
    channelAccessToken: settings.line_channel_access_token,
    channelSecret: settings.line_channel_secret,
  });

  const signature = event.headers['x-line-signature'] || '';
  if (!validateSignature(event.body || '', settings.line_channel_secret, signature)) {
    return { statusCode: 401, body: 'Invalid signature' };
  }

  const events: WebhookEvent[] = JSON.parse(event.body || '').events;

  for (const lineEvent of events) {
    if (lineEvent.type === 'message' && lineEvent.message.type === 'text') {
      const userId = lineEvent.source.userId!;
      const userMessage = lineEvent.message.text;
      const eventId = (lineEvent as any).webhookEventId;

      const { data: existingLog } = await supabase.from('chat_logs').select('id').eq('webhook_event_id', eventId).single();
      if (existingLog) continue;

      const { error: userLogError } = await supabase.from('chat_logs').insert({
        line_user_id: userId,
        webhook_event_id: eventId,
        message: userMessage,
        sender: 'user',
      });
      if (userLogError) console.error('User Log Error:', userLogError);

      const { data: userState } = await supabase.from('user_states').select('*').eq('line_user_id', userId).single();
      const handoverKeywords = settings.handover_keywords.split(',').map((k: string) => k.trim());
      const isKeywordHit = handoverKeywords.some((k: string) => userMessage.includes(k));

      if (isKeywordHit) {
        let nickname = '匿名用戶';
        try { const p = await lineClient.getProfile(userId); nickname = p.displayName; } catch (e) {}
        await supabase.from('user_states').upsert({ line_user_id: userId, nickname, is_human_mode: true, last_human_interaction: new Date().toISOString() });
        await lineClient.replyMessage(lineEvent.replyToken, { type: 'text', text: '已為您轉接真人客服，請稍候。' });
        const agentIds = settings.agent_user_ids?.split(',').map((id: string) => id.trim()).filter(Boolean);
        if (agentIds) {
          for (const id of agentIds) {
            try { await lineClient.pushMessage(id, { type: 'text', text: `🔔 真人通知：【${nickname}】正在呼叫專人。` }); } catch (e) {}
          }
        }
        continue;
      }

      if (userState?.is_human_mode) {
        const last = new Date(userState.last_human_interaction).getTime();
        if (new Date().getTime() - last < settings.handover_timeout_minutes * 60 * 1000) continue;
        await supabase.from('user_states').update({ is_human_mode: false }).eq('line_user_id', userId);
      }

      if (!settings.is_ai_enabled) continue;

      const { data: contextLogs } = await supabase.from('chat_logs').select('message, sender, ai_response_id').eq('line_user_id', userId).order('created_at', { ascending: false }).limit(5);
      const history = contextLogs?.reverse() || [];

      let aiResult: { text: string, id?: string } = { text: '' };
      try {
        if (settings.active_ai === 'gpt') aiResult = await callGPT(settings, history, userMessage);
        else aiResult = { text: await callGemini(settings, history, userMessage) };
      } catch (e: any) {
        aiResult = { text: `❌ AI 錯誤：\n${e.message}` };
      }

      if (aiResult.text) {
        await lineClient.replyMessage(lineEvent.replyToken, { type: 'text', text: aiResult.text });
        const { error: aiLogError } = await supabase.from('chat_logs').insert({
          line_user_id: userId,
          message: aiResult.text,
          sender: 'ai',
          ai_type: settings.active_ai,
          ai_response_id: aiResult.id
        });
        if (aiLogError) console.error('AI Log Error:', aiLogError);
      }
    }
  }
  return { statusCode: 200, body: 'OK' };
};

async function callGPT(settings: any, history: any[], currentMessage: string) {
  const isGPT5 = settings.gpt_model_name.includes('gpt-5');
  let fileContent = '';
  if (settings.reference_file_url) {
    try { const r = await fetch(settings.reference_file_url); if (r.ok) fileContent = await r.text(); } catch (e) {}
  }
  const systemContent = `${settings.system_prompt}\n\n參考文字：\n${settings.reference_text}\n\n檔案內容：\n${fileContent}`;

  if (isGPT5) {
    const last = [...history].reverse().find(h => h.sender === 'ai' && h.ai_response_id);
    const body: any = {
      model: settings.gpt_model_name,
      input: `System: ${systemContent}\nUser: ${currentMessage}`,
      reasoning: { effort: settings.gpt_reasoning_effort || 'none' },
      text: { verbosity: settings.gpt_verbosity || 'medium' }
    };
    if (last) body.previous_response_id = last.ai_response_id;
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${settings.gpt_api_key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const result: any = await res.json();
    if (!res.ok || result.error) throw new Error(result.error?.message || res.statusText);
    return { text: result.output?.text || '', id: result.id };
  }

  const openai = new OpenAI({ apiKey: settings.gpt_api_key });
  const messages: any[] = [{ role: 'system', content: systemContent }];
  for (const h of history) messages.push({ role: h.sender === 'user' ? 'user' : 'assistant', content: h.message });
  messages.push({ role: 'user', content: currentMessage });

  const params: any = { model: settings.gpt_model_name, messages };
  if (settings.gpt_model_name.startsWith('o1') || settings.gpt_model_name.startsWith('o3')) {
    params.max_completion_tokens = settings.gpt_max_tokens;
  } else {
    params.max_tokens = settings.gpt_max_tokens;
    params.temperature = settings.gpt_temperature;
  }
  const completion = await openai.chat.completions.create(params);
  return { text: completion.choices[0].message.content || '', id: completion.id };
}

async function callGemini(settings: any, history: any[], currentMessage: string) {
  let filePart: any = null;
  if (settings.reference_file_url) {
    try {
      const r = await fetch(settings.reference_file_url);
      if (r.ok) {
        const b = await r.arrayBuffer();
        filePart = { inline_data: { data: Buffer.from(b).toString('base64'), mime_type: settings.reference_file_url.endsWith('.pdf') ? 'application/pdf' : 'text/plain' } };
      }
    } catch (e) {}
  }
  const contents = history.map(h => ({ role: h.sender === 'user' ? 'user' : 'model', parts: [{ text: h.message }] }));
  const userParts: any[] = [{ text: `System: ${settings.system_prompt}\nReference: ${settings.reference_text}` }];
  if (filePart) userParts.push(filePart);
  userParts.push({ text: `User: ${currentMessage}` });
  contents.push({ role: 'user', parts: userParts });

  const generationConfig: any = { temperature: settings.gemini_temperature || 1.0, maxOutputTokens: settings.gemini_max_tokens };
  if (settings.gemini_model_name.includes('gemini-3')) {
    generationConfig.thinking_config = { include_thoughts: true, thinking_level: settings.gemini_thinking_level || 'high' };
  }

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${settings.gemini_model_name}:generateContent?key=${settings.gemini_api_key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents, generationConfig })
  });
  const result: any = await res.json();
  if (!res.ok || result.error) throw new Error(result.error?.message || 'Gemini API Error');
  return result.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text || '';
}
