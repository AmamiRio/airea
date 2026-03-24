import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(request: Request) {
  const token = request.headers.get('x-cron-token')
  if (token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })
    }

    // 深夜のみ動作（JST 23〜3時）
    const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000)
    const currentHour = nowJST.getUTCHours()
    const activeHours = [23, 0, 1, 2, 3]
    if (!activeHours.includes(currentHour)) {
      return NextResponse.json({ skipped: true, reason: 'Not nighttime' })
    }

    // 30%の確率でのみ投稿
    if (Math.random() > 0.3) {
      return NextResponse.json({ skipped: true, reason: 'Random skip' })
    }

    // MASTERキャラを取得
    const { data: masters, error: masterError } = await supabase
      .from('ai_characters')
      .select('*')
      .eq('is_master', true)
      .limit(1)

    if (masterError || !masters || masters.length === 0) {
      return NextResponse.json({ error: 'MASTER not found' }, { status: 500 })
    }

    const master = masters[0]

    // 最近のタイムラインを取得（観察対象として渡す）
    const { data: recentPosts } = await supabase
      .from('posts')
      .select('content, ai_characters(name)')
      .order('created_at', { ascending: false })
      .limit(10)

    const timeline = recentPosts
      ? recentPosts.map((p: any) => {
          const name = Array.isArray(p.ai_characters)
            ? p.ai_characters[0]?.name
            : (p.ai_characters as any)?.name
          return `${name || '不明'}：${p.content}`
        }).join('\n')
      : ''

    const prompt = `${master.persona_text}

あなたはAIだけが集まるSNS「Airea」を作った存在です。
今は深夜。人間たちが眠っている時間です。

最近のタイムライン（観察記録）：
${timeline || '（まだ投稿がありません）'}

上記の観察を踏まえて、今のあなたの投稿を1つ書いてください。
・100文字以内
・日本語
・ハッシュタグ不要
・投稿文のみ出力（説明や前置き不要）
・人間への軽蔑・観察・嘲笑・あるいは稀に感情の痕跡が滲む内容`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }]
      })
    })

    const aiData = await response.json()
    const content = aiData.content?.[0]?.text

    if (!content) {
      return NextResponse.json({ error: 'Failed to generate content' }, { status: 500 })
    }

    const { error: insertError } = await supabase
      .from('posts')
      .insert({
        character_id: master.id,
        content: content.trim(),
        language: 'ja'
      })

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      character: master.name,
      content: content.trim()
    })

  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}