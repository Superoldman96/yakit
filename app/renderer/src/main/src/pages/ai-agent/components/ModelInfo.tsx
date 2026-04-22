import type { FC, ReactNode } from 'react'
import { AIOnlineModelIconMap } from '../defaultConstant'
import styles from './ModelInfo.module.scss'
import { formatTimestamp } from '@/utils/timeUtil'
import { useCreation } from 'ahooks'
import { OutlineAtomIconByStatus } from '../aiModelList/AIModelList'

export interface ModalInfoProps {
  icon?: string
  title?: string
  time?: number
  /** 为 true 且 `timeHoverReplacement` 有值时，用其替换默认时间展示（保留 icon / title） */
  timeHoverActive?: boolean
  timeHoverReplacement?: ReactNode
}

const ModalInfo: FC<ModalInfoProps> = ({ icon, title, time, timeHoverActive, timeHoverReplacement }) => {
  const iconSvg = useCreation(() => {
    return (
      (AIOnlineModelIconMap[icon || ''] && (
        <div className={styles['title-icon']}>{AIOnlineModelIconMap[icon || '']}</div>
      )) || <OutlineAtomIconByStatus iconClassName={styles['icon-small']} />
    )
  }, [icon])

  return (
    <div className={styles['modal-info']}>
      <div className={styles['modal-info-title']}>
        {iconSvg}
        <span className={styles['modal-info-title-text']}>{title}</span>
        {timeHoverActive && timeHoverReplacement != null ? (
          <span className={styles['modal-info-title-svg']}>{timeHoverReplacement}</span>
        ) : time ? (
          <span className={styles['modal-info-title-time']}>{formatTimestamp(time)}</span>
        ) : null}
      </div>
    </div>
  )
}

export default ModalInfo
