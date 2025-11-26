import { TopView } from '@renderer/components/TopView'
import { useRuntime } from '@renderer/hooks/useRuntime'
import { Modal } from 'antd'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

const VideoContainer = styled.div`
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  border-radius: 8px;
  overflow: hidden;

  video {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
`

interface ShowParams {
  title: string
  videoPath: string
}

interface Props extends ShowParams {
  resolve: (data: any) => void
}

const PopupContainer: React.FC<Props> = ({ title, videoPath = 'cherry-studio-kb.mp4', resolve }) => {
  const [open, setOpen] = useState(true)
  const { i18n } = useTranslation()
  const { resourcesPath } = useRuntime()

  const handleClose = () => setOpen(false)

  const videoUrl = `file://${resourcesPath}/video/${videoPath}`

  VideoPopup.hide = () => setOpen(false)

  return (
    <Modal
      title={title}
      open={open}
      onCancel={handleClose}
      afterClose={() => resolve({ closed: true })}
      transitionName="animation-move-down"
      centered
      closable={true}
      maskClosable={true}
      styles={{
        header: { paddingLeft: 20 },
        body: { paddingLeft: 20, paddingRight: 20 },
        content: { maxHeight: '80vh', maxWidth: '60vw', margin: '0 auto', overflow: 'hidden' }
      }}
      width={1000}
      footer={null}>
      <VideoContainer>
        <video controls autoPlay>
          <source src={videoUrl} type="video/mp4" />
          {i18n.language.startsWith('zh')
            ? '您的浏览器不支持视频播放。'
            : 'Your browser does not support the video tag.'}
        </video>
      </VideoContainer>
    </Modal>
  )
}

const TopViewKey = 'VideoPopup'

export default class VideoPopup {
  static topviewId = 0
  static hide() {
    TopView.hide(TopViewKey)
  }
  static async show(props?: ShowParams) {
    return new Promise<{ closed: boolean }>((resolve) => {
      TopView.show(
        <PopupContainer
          {...(props || {})}
          resolve={(v) => {
            resolve(v)
            TopView.hide(TopViewKey)
          }}
        />,
        TopViewKey
      )
    })
  }
}
