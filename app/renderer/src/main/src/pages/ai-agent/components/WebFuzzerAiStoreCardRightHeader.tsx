import { type FC } from 'react'

import { OutlineCheckCheckIcon, OutlineDataComparisonIcon } from '@/assets/icon/outline'

import styles from './WebFuzzerAiStoreCardRightHeader.module.scss'
import { useMemoizedFn } from 'ahooks'
import useChatIPC from '@/pages/ai-re-act/hooks/useChatIPC'

const WebFuzzerAiStoreCardRightHeader: FC = () => {
  const {} = useChatIPC()
  // 替换操作
  const handleApplication = useMemoizedFn(() => {
    console.log(111)
  })

  // 对比操作
  const handleContrast = useMemoizedFn(() => {
    console.log(222)
  })

  return (
    <div className={styles['container']}>
      <OutlineDataComparisonIcon onClick={handleApplication} />
      <OutlineCheckCheckIcon onClick={handleContrast} />
    </div>
  )
}

export { WebFuzzerAiStoreCardRightHeader }
