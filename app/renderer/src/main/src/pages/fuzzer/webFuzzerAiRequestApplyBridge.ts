import { yakitFailed } from '@/utils/notification'

const pageApplyHandlers = new Map<string, (raw: string) => void>()
const pageGetRequestHandlers = new Map<string, () => string>()
const pageAiAutoApplyGetEnabled = new Map<string, () => boolean>()
type WebFuzzerAiAutoApplyLast = { streamId: string | null; content: string }

const lastWebFuzzerAiAutoApply = new Map<string, WebFuzzerAiAutoApplyLast>()
const maxAutoApplyListItemIndex = new Map<string, Map<string, number>>()

/**
 * 由 `HTTPFuzzerPageCore` 在挂载时注册，用于从 AI 代码卡「应用」将请求原文写入当前页并同步会话存储。
 */
export function registerWebFuzzerPageApplyRequestFromCard(pageId: string, handler: (raw: string) => void): () => void {
  pageApplyHandlers.set(pageId, handler)
  return () => {
    if (pageApplyHandlers.get(pageId) === handler) {
      pageApplyHandlers.delete(pageId)
    }
  }
}

/**
 * 由 `HTTPFuzzerPageCore` 注册，供「对比」等能力读取当前页 `requestRef` 中的请求原文（与 Monaco 侧一致）。
 */
export function registerWebFuzzerPageGetRequestString(pageId: string, getRequest: () => string): () => void {
  pageGetRequestHandlers.set(pageId, getRequest)
  return () => {
    if (pageGetRequestHandlers.get(pageId) === getRequest) {
      pageGetRequestHandlers.delete(pageId)
    }
  }
}

/** 读取当前 Web Fuzzer 页签请求盒中的内容；未注册时返回 `null` */
export function getWebFuzzerPageRequestString(pageId: string): string | null {
  const fn = pageGetRequestHandlers.get(pageId)
  if (!fn) return null
  return fn()
}

/**
 * 由 `HTTPFuzzerPageCore` 注册：是否开启「AI 自动改包」（勾选项）。
 */
export function registerWebFuzzerPageAiAutoApplyEnabled(pageId: string, getEnabled: () => boolean): () => void {
  pageAiAutoApplyGetEnabled.set(pageId, getEnabled)
  return () => {
    if (pageAiAutoApplyGetEnabled.get(pageId) === getEnabled) {
      pageAiAutoApplyGetEnabled.delete(pageId)
    }
  }
}

export function clearWebFuzzerLastAiAutoApplySnapshot(pageId: string) {
  lastWebFuzzerAiAutoApply.delete(pageId)
  maxAutoApplyListItemIndex.delete(pageId)
}

/**
 * `AIYaklangCode` 的 `content` 更新时调用：在已勾选自动改包且内容相对上次有变化时，等同「应用」写入请求盒并落盘（无 yakit 失败弹窗）
 * @param autoApplyStreamId 单条流/卡片的 `stream.id`：不同回复即使报文字符串与上一条终稿相同也应再次应用
 * @param autoApplyChatSessionId 当前 ReAct 会话，换会话时列表下标会重置
 * @param listItemIndex 在 `chats.elements` 中的下标，用于拒绝虚拟列表中更早条目重挂载时的越权覆盖
 */
export function tryWebFuzzerAutoApplyRequestFromAiYaklangCode(
  pageId: string,
  content: string | undefined,
  autoApplyStreamId?: string,
  autoApplyChatSessionId?: string,
  listItemIndex?: number,
): void {
  if (content === undefined) return
  if (content.trim() === '') return
  if (!pageAiAutoApplyGetEnabled.get(pageId)?.()) return
  const sessionId = (autoApplyChatSessionId || '').trim()
  if (sessionId && listItemIndex !== undefined) {
    const bySess = maxAutoApplyListItemIndex.get(pageId)
    const maxIdx = bySess?.get(sessionId) ?? -1
    if (listItemIndex < maxIdx) {
      return
    }
  }
  const last = lastWebFuzzerAiAutoApply.get(pageId)
  const id = (autoApplyStreamId || '').trim() || null
  if (last) {
    if (id) {
      if (last.streamId === id && last.content === content) return
    } else if (last.content === content) {
      // 无 stream id 时与旧版一致：全串相同时跳过
      return
    }
  }
  const apply = pageApplyHandlers.get(pageId)
  if (!apply) return
  if (sessionId && listItemIndex !== undefined) {
    let m = maxAutoApplyListItemIndex.get(pageId)
    if (!m) {
      m = new Map()
      maxAutoApplyListItemIndex.set(pageId, m)
    }
    const maxIdx = m.get(sessionId) ?? -1
    m.set(sessionId, Math.max(maxIdx, listItemIndex))
  }
  lastWebFuzzerAiAutoApply.set(pageId, { streamId: id, content })
  apply(content)
}

/** 从 Web Fuzzer AI 代码卡将内容应用到指定页签的请求编辑器（会触发 `onSetRequest` 的会话落盘与编辑器刷新） */
export function applyRequestContentToWebFuzzerPage(pageId: string, raw: string): void {
  const fn = pageApplyHandlers.get(pageId)
  if (!fn) {
    yakitFailed('未找到对应的 Web Fuzzer 页，请保持该页已打开。')
    return
  }
  fn(raw)
}

export { WebFuzzerAiRequestCompareModalContent } from './webFuzzerAiRequestCompareModalContent'
export type { WebFuzzerAiRequestCompareModalContentProps } from './webFuzzerAiRequestCompareModalContent'
