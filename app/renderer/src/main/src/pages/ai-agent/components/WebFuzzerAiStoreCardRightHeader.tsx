import { type FC } from 'react'

import { OutlineCheckCheckIcon, OutlineDataComparisonIcon } from '@/assets/icon/outline'

import styles from './WebFuzzerAiStoreCardRightHeader.module.scss'
import { useMemoizedFn } from 'ahooks'
import { Tooltip } from 'antd'
import {
  applyRequestContentToWebFuzzerPage,
  getWebFuzzerPageRequestString,
  WebFuzzerAiRequestCompareModalContent,
} from '@/pages/fuzzer/webFuzzerAiRequestApplyBridge'
import { yakitFailed, yakitNotify } from '@/utils/notification'
import { showYakitModal } from '@/components/yakitUI/YakitModal/YakitModalConfirm'

const WebFuzzerAiStoreCardRightHeader: FC<{ content?: string; fuzzerPageId: string }> = ({
  content,
  fuzzerPageId,
}) => {
  // 应用操作：将卡片中的请求/代码全文写入对应当前 Web Fuzzer 页并同步 `pageInfo` 会话
  const handleApplication = useMemoizedFn(() => {
    if (fuzzerPageId == null || fuzzerPageId === '') {
      yakitNotify('error', '未绑定 Web Fuzzer 页签。')
      return
    }
    if (content === undefined) {
      yakitNotify('info', '没有可应用的内容。')
      return
    }
    applyRequestContentToWebFuzzerPage(fuzzerPageId, content)
  })

  // 对比：弹窗中 Diff 当前 Web Fuzzer 请求与卡片 content（`footer` 为空，顶栏 取消/应用）
  const handleContrast = useMemoizedFn(() => {
    if (fuzzerPageId == null || fuzzerPageId === '') {
      yakitNotify('error', '未绑定 Web Fuzzer 页签。')
      return
    }
    const current = getWebFuzzerPageRequestString(fuzzerPageId)
    if (current === null) {
      yakitFailed('未找到对应的 Web Fuzzer 页，请保持该页已打开。')
      return
    }
    const m = showYakitModal({
      title: null,
      footer: null,
      hiddenHeader: true,
      type: 'white',
      width: '90%',
      style: { maxWidth: 1400 },
      closable: false,
      bodyStyle: { padding: 0 },
      content: (
        <WebFuzzerAiRequestCompareModalContent
          currentRequest={current}
          cardContent={content ?? ''}
          onCancel={() => m.destroy()}
          onApply={() => {
            if (content === undefined) {
              yakitNotify('info', '没有可应用的内容。')
              m.destroy()
              return
            }
            applyRequestContentToWebFuzzerPage(fuzzerPageId, content)
            m.destroy()
          }}
        />
      ),
    })
  })

  return (
    <div className={styles['container']}>
      <Tooltip title="应用">
        <OutlineDataComparisonIcon onClick={handleApplication} />
      </Tooltip>
      <Tooltip title="对比">
        <OutlineCheckCheckIcon onClick={handleContrast} />
      </Tooltip>
    </div>
  )
}

export { WebFuzzerAiStoreCardRightHeader }
