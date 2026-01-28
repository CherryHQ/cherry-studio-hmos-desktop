import VideoPopup from '@renderer/components/Popups/VideoPopup'
import { Play, X } from 'lucide-react'
import { FC, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

const TutorialTip: FC = () => {
  const [showTutorialTip, setShowTutorialTip] = useState(() => {
    return localStorage.getItem('tutorial-tip-dismissed') !== 'true'
  })
  const { t } = useTranslation()

  const onOpenVideoTutorial = async () => {
    await VideoPopup.show({
      title: t('tutorial.hmos-llm.title'),
      videoPath: 'cherry-studio-kb.mp4'
    })
  }

  const onDismissTutorialTip = () => {
    localStorage.setItem('tutorial-tip-dismissed', 'true')
    setShowTutorialTip(false)
  }

  if (!showTutorialTip) {
    return null
  }

  return (
    <TutorialTipContainer>
      <TipContent onClick={onOpenVideoTutorial}>
        <TipIcon>
          <Play size={16} />
        </TipIcon>
        <TipText>
          <TipTitle>{t('tutorial.hmos-llm.title')}</TipTitle>
          <TipSubtitle>{t('tutorial.hmos-llm.subtitle')}</TipSubtitle>
        </TipText>
      </TipContent>
      <CloseButton onClick={onDismissTutorialTip}>
        <X size={14} />
      </CloseButton>
    </TutorialTipContainer>
  )
}

const TutorialTipContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 8px 12px 12px 12px;
  padding: 12px 16px;
  background: linear-gradient(135deg, var(--color-primary-soft) 0%, var(--color-primary-lighter) 100%);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    background: linear-gradient(135deg, var(--color-primary-soft) 0%, var(--color-primary) 100%);
  }

  &:active {
    transform: translateY(0);
  }

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 12px;
    right: 12px;
    height: 2px;
    background: var(--color-primary);
    border-radius: 1px;
  }
`

const TipContent = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
`

const TipIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: var(--color-primary);
  border-radius: 8px;
  color: white;
  flex-shrink: 0;
`

const TipText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
`

const TipTitle = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  line-height: 1.2;
`

const TipSubtitle = styled.div`
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.2;
`

const CloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;

  &:hover {
    background: rgba(0, 0, 0, 0.1);
    color: var(--color-text);
  }

  &:active {
    transform: scale(0.95);
  }
`

export default TutorialTip
