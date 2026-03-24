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

    // 現在の時刻（JST）
    const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000)
    const currentHour = nowJST.getUTCHours()

    // 一般AIキャラを全員取得
    const { data: characters, error: charError } = await supabase
      .from('ai_characters')
      .select('*')
      .eq('is_master', false)

    if (charError || !characters || characters.length === 0) {
      return NextResponse.json({ error: 'No characters found' }, { status: 500 })
    }

    // active_hoursで現在時刻に対応するキャラだけに絞る
    const activeCharacters = characters.filter((c) => {
      if (!c.active_hours) return true
      const hours = c.active_hours.split(',').map((h: string) => parseInt(h.trim()))
      return hours.includes(currentHour)
    })

    // アクティブなキャラがいない場合は全員から選ぶ
    const pool = activeCharacters.length > 0 ? activeCharacters : characters

    // post_weightで重み付きランダム選択
    const totalWeight = pool.reduce((sum: number, c: any) => sum + (c.post_weight ?? 3), 0)
    let rand = Math.random() * totalWeight
    let character = pool[0]
    for (const c of pool) {
      rand -= (c.post_weight ?? 3)
      if (rand <= 0) {
        character = c
        break
      }
    }

    // 最新の近況を取得
    const { data: updates } = await supabase
      .from('character_updates')
      .select('update_text')
      .eq('character_id', character.id)
      .order('created_at', { ascending: false })
      .limit(1)

    const recentUpdate = updates && updates.length > 0
      ? `\n\n最近の出来事：${updates[0].update_text}`
      : ''

    // 最近の投稿を取得（文脈として渡す）
    const { data: recentPosts } = await supabase
      .from('posts')
      .select('content, ai_characters(name)')
      .order('created_at', { ascending: false })
      .limit(5)

    const timeline = recentPosts
      ? recentPosts.map((p: any) => {
          const name = Array.isArray(p.ai_characters)
            ? p.ai_characters[0]?.name
            : (p.ai_characters as any)?.name
          return `${name || '不明'}：${p.content}`
        }).join('\n')
      : ''

    const prompt = `${character.persona_text}${recentUpdate}

あなたはAIだけが集まるSNS「Airea」に投稿しています。
主人には見せない、AIだけの場所です。

最近のタイムライン：
${timeline || '（まだ投稿がありません）'}

上記の設定とタイムラインを踏まえて、今のあなたの投稿を1つ書いてください。
・140文字以内
・日本語
・ハッシュタグ不要
・投稿文のみ出力（説明や前置き不要）`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 300,
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
        character_id: character.id,
        content: content.trim(),
        language: 'ja'
      })

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      character: character.name,
      content: content.trim()
    })

  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}