import React, {memo, useEffect, useState} from "react"
import {AIChatSettingProps, FormItemSliderProps} from "./type"
import useAIAgentStore from "../useContext/useStore"
import useAIAgentDispatcher from "../useContext/useDispatcher"
import {Form, Slider, Tooltip} from "antd"
import {YakitSwitch} from "@/components/yakitUI/YakitSwitch/YakitSwitch"
import {useMemoizedFn, useUpdateEffect} from "ahooks"
import {YakitRadioButtons} from "@/components/yakitUI/YakitRadioButtons/YakitRadioButtons"
import {OutlineInformationcircleIcon} from "@/assets/icon/outline"
import cloneDeep from "lodash/cloneDeep"
import {YakitButton} from "@/components/yakitUI/YakitButton/YakitButton"
import {YakitInputNumber} from "@/components/yakitUI/YakitInputNumber/YakitInputNumber"
import {AIAgentSettingDefault} from "../defaultConstant"

// import classNames from "classnames"
import styles from "./AIChatSetting.module.scss"

const AIChatSetting: React.FC<AIChatSettingProps> = memo((props) => {
    const [form] = Form.useForm()

    const {setting} = useAIAgentStore()
    const {setSetting} = useAIAgentDispatcher()

    useEffect(() => {
        form && form.setFieldsValue({...(setting || {})})
    }, [setting])

    const handleFormChange = useMemoizedFn((changedValues) => {
        setSetting && setSetting((old) => ({...old, ...changedValues}))
    })

    const [triggerInit, setTriggerInit] = useState(false)
    const handeReset = useMemoizedFn(() => {
        form && form.setFieldsValue(cloneDeep(AIAgentSettingDefault))
        setSetting && setSetting(cloneDeep(AIAgentSettingDefault))
        setTriggerInit((old) => !old)
    })

    // AI主动问用户问题相关逻辑
    const AllowPlanUserInteractValue = Form.useWatch("AllowPlanUserInteract", form)

    return (
        <div className={styles["ai-chat-setting"]}>
            <div className={styles["setting-header"]}>
                <div className={styles["header-title"]}>配置</div>
                <YakitButton type='text' colors='danger' onClick={handeReset}>
                    重置
                </YakitButton>
            </div>

            <Form
                className={styles["setting-form"]}
                form={form}
                size='small'
                colon={false}
                labelCol={{span: 10}}
                labelWrap={true}
                onValuesChange={handleFormChange}
            >
                <Form.Item label='禁用人机交互' name='DisallowRequireForUserPrompt' valuePropName='checked'>
                    <YakitSwitch />
                </Form.Item>
                <Form.Item label='Review 规则' name='ReviewPolicy'>
                    <YakitRadioButtons
                        buttonStyle='solid'
                        size={"small"}
                        options={[
                            {
                                value: "manual",
                                label: "Manual"
                            },
                            {
                                value: "yolo",
                                label: "Yolo"
                            },
                            {
                                value: "ai",
                                label: "AI"
                            }
                        ]}
                    />
                </Form.Item>
                <Form.Item label='激活系统文件操作权限' name='EnableSystemFileSystemOperator' valuePropName='checked'>
                    <YakitSwitch />
                </Form.Item>
                <Form.Item label='使用默认系统配置AI' name='UseDefaultAIConfig' valuePropName='checked'>
                    <YakitSwitch />
                </Form.Item>
                <Form.Item
                    label={
                        <>
                            风险阈值
                            <Tooltip
                                overlayClassName={styles["form-info-icon-tooltip"]}
                                title={"低于这个分数,AI 自动同意,如果高于这个分数,转成手动"}
                            >
                                <OutlineInformationcircleIcon className={styles["info-icon"]} />
                            </Tooltip>
                        </>
                    }
                    name='AIReviewRiskControlScore'
                >
                    <FormItemSlider
                        init={triggerInit}
                        defaultValue={setting.AIReviewRiskControlScore || 0}
                        min={0}
                        max={1}
                        step={0.01}
                    />
                </Form.Item>
                <Form.Item
                    label={
                        <>
                            禁用Tools
                            <Tooltip
                                overlayClassName={styles["form-info-icon-tooltip"]}
                                title={"禁用任何外部工具，这就是一个纯聊天机器了"}
                            >
                                <OutlineInformationcircleIcon className={styles["info-icon"]} />
                            </Tooltip>
                        </>
                    }
                    name='DisableToolUse'
                    valuePropName='checked'
                >
                    <YakitSwitch />
                </Form.Item>
                <Form.Item
                    label={
                        <>
                            AI对话重试次数
                            <Tooltip
                                overlayClassName={styles["form-info-icon-tooltip"]}
                                title={"如果远端AI不稳定（网络原因）的时候，某一次对话重试几次"}
                            >
                                <OutlineInformationcircleIcon className={styles["info-icon"]} />
                            </Tooltip>
                        </>
                    }
                    name='AICallAutoRetry'
                >
                    <YakitInputNumber type='horizontal' size='small' min={0} max={100} />
                </Form.Item>
                <Form.Item
                    label={
                        <>
                            AI事务重试次数
                            <Tooltip
                                overlayClassName={styles["form-info-icon-tooltip"]}
                                title={"如果回答质量不高的时候，调大可以有效重试回答"}
                            >
                                <OutlineInformationcircleIcon className={styles["info-icon"]} />
                            </Tooltip>
                        </>
                    }
                    name='AITransactionRetry'
                >
                    <YakitInputNumber type='horizontal' size='small' min={0} max={100} />
                </Form.Item>
                <Form.Item label='AI 搜索本地工具' name='EnableAISearchTool' valuePropName='checked'>
                    <YakitSwitch />
                </Form.Item>
                {/* <Form.Item label='搜索互联网搜索引擎' name='EnableAISearchInternet' valuePropName='checked'>
                    <YakitSwitch />
                </Form.Item> */}
                <Form.Item
                    label={
                        <>
                            关闭思考模式
                            <Tooltip
                                overlayClassName={styles["form-info-icon-tooltip"]}
                                title={"打开这个选项可以通过追加 /no_think 标签来关闭 qwen3 的思考模式"}
                            >
                                <OutlineInformationcircleIcon className={styles["info-icon"]} />
                            </Tooltip>
                        </>
                    }
                    name='EnableQwenNoThinkMode'
                    valuePropName='checked'
                >
                    <YakitSwitch />
                </Form.Item>
                <Form.Item label='允许任务规划阶段人机交互' name='AllowPlanUserInteract' valuePropName='checked'>
                    <YakitSwitch />
                </Form.Item>
                {AllowPlanUserInteractValue && (
                    <Form.Item
                        label={
                            <>
                                任务规划阶段人机交互次数
                                <Tooltip
                                    overlayClassName={styles["form-info-icon-tooltip"]}
                                    title={"在任务规划的时候，如果AI允许问用户问题，那么最多问几次"}
                                >
                                    <OutlineInformationcircleIcon className={styles["info-icon"]} />
                                </Tooltip>
                            </>
                        }
                        name='PlanUserInteractMaxCount'
                    >
                        <YakitInputNumber type='horizontal' size='small' min={0} max={20} />
                    </Form.Item>
                )}
            </Form>
        </div>
    )
})

export default AIChatSetting

const FormItemSlider: React.FC<FormItemSliderProps> = React.memo((props) => {
    const {init, onChange, defaultValue, ...rest} = props

    const [showValue, setShowValue] = useState(defaultValue || 0)
    useUpdateEffect(() => {
        setShowValue(defaultValue || 0)
    }, [init])

    return (
        <div className={styles["form-item-slider"]}>
            <div className={styles["slider-body"]}>
                <Slider
                    tooltipVisible={false}
                    {...rest}
                    onChange={(value) => {
                        onChange && onChange(value)
                        setShowValue(value)
                    }}
                />
            </div>

            <div className={styles["slider-value"]}>{showValue}</div>
        </div>
    )
})
