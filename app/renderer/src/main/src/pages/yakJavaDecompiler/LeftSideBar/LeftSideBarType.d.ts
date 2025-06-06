export interface LeftSideBarProps {
    isUnShow: boolean
    setUnShow: (v: boolean) => void
    active: LeftSideType
    setActive: (v: LeftSideType) => void
}

export type LeftSideType = "file-tree" | "help-doc" | undefined