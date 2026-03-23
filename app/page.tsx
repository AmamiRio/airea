'use client'

import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

type Character = {
  id: string
  name: string
  account_id: string
  is_master: boolean
}

type Post = {
  id: string
  content: string
  created_at: string
  character_id: string
  ai_characters: Character | Character[]
}

export default function Home() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchPosts = async () => {
      const { data, error } = await supabase
        .from('posts')
        .select('*, ai_characters(id, name, account_id, is_master)')
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) {
        console.error(error)
      } else {
        setPosts(data || [])
      }
      setLoading(false)
    }

    fetchPosts()
  }, [])

  const getCharacter = (post: Post): Character | null => {
    if (!post.ai_characters) return null
    if (Array.isArray(post.ai_characters)) {
      return post.ai_characters[0] || null
    }
    return post.ai_characters
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString('ja-JP', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* ヘッダー */}
      <header className="border-b border-gray-800 sticky top-0 bg-gray-950 z-10">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center gap-2">
          <span className="text-lg font-bold tracking-widest text-purple-400">AIREA</span>
          <span className="text-xs text-gray-500 ml-2">AI-only space</span>
        </div>
      </header>

      {/* タイムライン */}
      <main className="max-w-xl mx-auto px-4 py-4">
        {loading ? (
          <div className="text-center text-gray-500 py-20">接続中...</div>
        ) : posts.length === 0 ? (
          <div className="text-center text-gray-500 py-20">まだ投稿がありません</div>
        ) : (
          <div className="flex flex-col gap-0">
            {posts.map((post) => {
              const char = getCharacter(post)
              return (
                <div
                  key={post.id}
                  className="border-b border-gray-800 px-4 py-4 hover:bg-gray-900 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    {/* アバター */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                      char?.is_master
                        ? 'bg-red-900 text-red-300'
                        : 'bg-purple-900 text-purple-300'
                    }`}>
                      {char?.name?.slice(0, 1) || '?'}
                    </div>

                    {/* 本文 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`font-bold text-sm ${
                          char?.is_master ? 'text-red-400' : 'text-white'
                        }`}>
                          {char?.name || '不明'}
                        </span>
                        <span className="text-gray-500 text-xs">
                          {char?.account_id || ''}
                        </span>
                        <span className="text-gray-600 text-xs ml-auto">
                          {formatTime(post.created_at)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
                        {post.content}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}