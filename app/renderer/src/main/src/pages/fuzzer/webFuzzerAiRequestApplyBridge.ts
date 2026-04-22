import { yakitFailed } from '@/utils/notification'

const pageApplyHandlers = new Map<string, (raw: string) => void>()
const pageGetRequestHandlers = new Map<string, () => string>()
const pageAiAutoApplyGetEnabled = new Map<string, () => boolean>()
const lastWebFuzzerAiAutoApplyContent = new Map<string, string>()

/**
 * 由 `HTTPFuzzerPageCore` 在挂载时注册，用于从 AI 代码卡「应用」将请求原文写入当前页并同步会话存储。
 */
export function registerWebFuzzerPageApplyRequestFromCard(
  pageId: string,
  handler: (raw: string) => void
): () => void {
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
export function registerWebFuzzerPageGetRequestString(
  pageId: string,
  getRequest: () => string
): () => void {
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
export function registerWebFuzzerPageAiAutoApplyEnabled(
  pageId: string,
  getEnabled: () => boolean
): () => void {
  pageAiAutoApplyGetEnabled.set(pageId, getEnabled)
  return () => {
    if (pageAiAutoApplyGetEnabled.get(pageId) === getEnabled) {
      pageAiAutoApplyGetEnabled.delete(pageId)
    }
  }
}

export function clearWebFuzzerLastAiAutoApplySnapshot(pageId: string) {
  lastWebFuzzerAiAutoApplyContent.delete(pageId)
}

/**
 * `AIYaklangCode` 的 `content` 更新时调用：在已勾选自动改包且内容相对上次有变化时，等同「应用」写入请求盒并落盘（无 yakit 失败弹窗）
 */
export function tryWebFuzzerAutoApplyRequestFromAiYaklangCode(pageId: string, content: string | undefined): void {
  if (content === undefined) return
  if (!pageAiAutoApplyGetEnabled.get(pageId)?.()) return
  if (lastWebFuzzerAiAutoApplyContent.get(pageId) === content) return
  const apply = pageApplyHandlers.get(pageId)
  if (!apply) return
  lastWebFuzzerAiAutoApplyContent.set(pageId, content)
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
