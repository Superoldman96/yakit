import React, { useEffect, useMemo, useState } from 'react'
import { WebFuzzerAiStoreCardRightHeader } from '@/pages/ai-agent/components/WebFuzzerAiStoreCardRightHeader'
import { AIYaklangCodeProps } from './type'
import ChatCard from '../ChatCard'
import { OutlinCompileTwoIcon } from '@/assets/icon/outline'
import { YakitEditor } from '@/components/yakitUI/YakitEditor/YakitEditor'
import ModalInfo from '../ModelInfo'
import styles from './AIYaklangCode.module.scss'
import { useCreation, useMemoizedFn, useThrottleEffect } from 'ahooks'
import { NewHTTPPacketEditor } from '@/utils/editors'
import useChatIPCDispatcher from '../../useContext/ChatIPCContent/useDispatcher'
import {
  WebFuzzerAiStore,
  aiChatDataStore,
  FlowAiStore,
  histroyAiStore,
  knowledgeBaseDataStore,
  type ChatDataStoreKey,
} from '@/pages/ai-agent/store/ChatDataStore'

/** 按当前挂载的 `cacheDataStore` 来源分支（副作用或后续可改为派生 state） */
function useChatDataStoreKeyBranch(key: ChatDataStoreKey) {
  useEffect(() => {
    switch (key) {
      case 'WebFuzzerAiStore':
        // 当前为 Web Fuzzer 页签注入的 WebFuzzerAiStore
        break
      case 'histroyAiStore':
        // HTTP 历史等：HistoryAIReActChatProvider + histroyAiStore
        break
      case 'FlowAiStore':
        // 流量分析等
        break
      case 'aiChatDataStore':
        // 独立 AI Agent 主流程
        break
      case 'knowledgeBaseDataStore':
        // 知识库
        break
      default:
        // 未匹配的单例或尚未挂载 cacheDataStore
        break
    }
  }, [key])
}

export const AIYaklangCode: React.FC<AIYaklangCodeProps> = React.memo((props) => {
  const { content: defContent, nodeLabel, modalInfo, contentType, referenceNode } = props
  const [content, setContent] = useState(defContent)
  const [cardHover, setCardHover] = useState(false)
  useThrottleEffect(
    () => {
      setContent(defContent)
    },
    [defContent],
    { wait: 500 },
  )
  const type = useCreation(() => {
    return contentType.split('/')?.[1] || 'plaintext'
  }, [contentType])
  const renderCode = useMemoizedFn(() => {
    switch (type) {
      case 'http-request':
        return <NewHTTPPacketEditor originValue={content} readOnly={true} />
      default:
        // case AIStreamContentType.CODE_YAKLANG:
        // case AIStreamContentType.CODE_PYTHON:
        return <YakitEditor type={type} value={content} readOnly={true} />
    }
  })
  const { chatIPCEvents } = useChatIPCDispatcher()
  const webFuzzerAiStoreFuzzerPageId = useMemo((): string | undefined => {
    const store = chatIPCEvents.fetchChatDataStore()
    return store instanceof WebFuzzerAiStore ? store.fuzzerPageId : undefined
  }, [chatIPCEvents])
  const chatDataStoreKey = useMemo((): ChatDataStoreKey => {
    const store = chatIPCEvents.fetchChatDataStore()
    switch (store) {
      case histroyAiStore:
        return 'histroyAiStore'
      case FlowAiStore:
        return 'FlowAiStore'
      case aiChatDataStore:
        return 'aiChatDataStore'
      case knowledgeBaseDataStore:
        return 'knowledgeBaseDataStore'
      default:
        if (store instanceof WebFuzzerAiStore) return 'WebFuzzerAiStore'
        return 'unknown'
    }
  }, [chatIPCEvents])
  useChatDataStoreKeyBranch(chatDataStoreKey)

  const isWebFuzzerAiStore = chatDataStoreKey === 'WebFuzzerAiStore'
  const titleExtra = useMemo(() => {
    if (!modalInfo) return null
    return (
      <ModalInfo
        {...modalInfo}
        timeHoverActive={isWebFuzzerAiStore && cardHover}
        timeHoverReplacement={
          isWebFuzzerAiStore && webFuzzerAiStoreFuzzerPageId ? (
            <WebFuzzerAiStoreCardRightHeader content={content} fuzzerPageId={webFuzzerAiStoreFuzzerPageId} />
          ) : undefined
        }
      />
    )
  }, [modalInfo, isWebFuzzerAiStore, cardHover, content, webFuzzerAiStoreFuzzerPageId])

  return (
    <div
      className={styles['ai-yaklang-code-hover-wrap']}
      onMouseEnter={() => setCardHover(true)}
      onMouseLeave={() => setCardHover(false)}
    >
      <ChatCard titleText={nodeLabel} titleIcon={<OutlinCompileTwoIcon />} titleExtra={titleExtra}>
        <div className={styles['ai-yaklang-code']}>{renderCode()}</div>
        {referenceNode}
      </ChatCard>
    </div>
  )
})
