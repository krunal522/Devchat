import React, { useState, useRef, useCallback, useEffect } from 'react';
import { EmojiPicker } from '../ui/EmojiPicker';
import { FileIcon } from '../ui/FileIcon';
import { MentionPopup } from './MentionPopup';
import { TypingIndicator } from './TypingIndicator';
import { AttachmentSheet } from './AttachmentSheet';
import { useChatStore } from '../../stores/chatStore';
import { useSocketActions } from '../../hooks/useSocket';
import { messageApi, type UploadedFileResponse } from '../../services/messageApi';
import { userApi } from '../../services/userApi';
import { useToastStore } from '../../stores/toastStore';
import type { User } from '../../types/user';
import '../ui/FileIcon.css';
import './MessageInput.css';

export function MessageInput() {
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const activeChannel = useChatStore((s) => s.activeChannel);
  const { sendMessage, startTyping, stopTyping } = useSocketActions();

  const [content, setContent] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachmentSheet, setShowAttachmentSheet] = useState(false);
  const [attachments, setAttachments] = useState<UploadedFileResponse[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Voice Recording State & Refs
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingTimerRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Mention State
  const [mentionFilter, setMentionFilter] = useState<string | null>(null);
  const [workspaceUsers, setWorkspaceUsers] = useState<User[]>([]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    userApi.getUsers().then(setWorkspaceUsers).catch(console.error);
  }, []);

  // Real Browser Microphone Voice Recording
  const startVoiceRecord = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/ogg')
        ? 'audio/ogg'
        : '';

      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Failed to start voice recording:', err);
      useToastStore.getState().addToast({
        type: 'danger',
        title: 'Microphone Error',
        message: 'Please allow microphone access in your browser to record voice messages.',
      });
    }
  };

  const stopVoiceRecord = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    const mediaRecorder = mediaRecorderRef.current;
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stream.getTracks().forEach((track) => track.stop());
      mediaRecorder.stop();
    }

    setIsRecording(false);
    setRecordingSeconds(0);
  };

  const sendVoiceRecord = () => {
    const mediaRecorder = mediaRecorderRef.current;
    if (!mediaRecorder || !activeChannelId) {
      stopVoiceRecord();
      return;
    }

    setIsUploading(true);

    mediaRecorder.onstop = async () => {
      // Stop all tracks
      mediaRecorder.stream.getTracks().forEach((track) => track.stop());

      const blobType = mediaRecorder.mimeType || 'audio/webm';
      const ext = blobType.includes('ogg') ? 'ogg' : blobType.includes('mp4') ? 'mp4' : 'webm';
      const audioBlob = new Blob(audioChunksRef.current, { type: blobType });

      if (audioBlob.size === 0) {
        setIsUploading(false);
        useToastStore.getState().addToast({
          type: 'warning',
          title: 'Empty Recording',
          message: 'No audio recorded',
        });
        return;
      }

      const audioFile = new File([audioBlob], `voice_note_${Date.now()}.${ext}`, { type: blobType });

      try {
        const uploadedFile = await messageApi.uploadFile(audioFile);
        uploadedFile.fileType = 'AUDIO';

        sendMessage(activeChannelId, '🎤 Voice Message', undefined, [uploadedFile]);
        useToastStore.getState().addToast({
          type: 'success',
          title: 'Voice Note Sent',
          message: 'Your voice message was sent successfully',
        });
      } catch (err: any) {
        console.error('Failed to upload voice note:', err);
        const blobUrl = URL.createObjectURL(audioBlob);
        const fallbackAtt: UploadedFileResponse = {
          fileUrl: blobUrl,
          fileName: `Voice Note (${recordingSeconds || 3}s).${ext}`,
          fileSize: audioBlob.size,
          mimeType: blobType,
          fileType: 'AUDIO',
        };
        sendMessage(activeChannelId, '🎤 Voice Message', undefined, [fallbackAtt as any]);
      } finally {
        setIsUploading(false);
      }
    };

    if (mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsRecording(false);
  };

  const handleTyping = useCallback(() => {
    if (!activeChannelId) return;
    startTyping(activeChannelId);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = window.setTimeout(() => {
      stopTyping(activeChannelId);
    }, 2000);
  }, [activeChannelId, startTyping, stopTyping]);

  const handleUploadFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);

    try {
      const uploadedResults: UploadedFileResponse[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const res = await messageApi.uploadFile(file);
        uploadedResults.push(res);
      }
      setAttachments((prev) => [...prev, ...uploadedResults]);
      useToastStore.getState().addToast({
        type: 'success',
        title: 'File Uploaded',
        message: `Uploaded ${files.length} file(s)`,
      });
    } catch (err: any) {
      useToastStore.getState().addToast({
        type: 'danger',
        title: 'Upload Failed',
        message: err.response?.data?.error?.message || 'Failed to upload file',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleUploadFiles(e.target.files);
    }
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUploadFiles(e.dataTransfer.files);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const replyingToMessage = useChatStore((s) => s.replyingToMessage);
  const setReplyingToMessage = useChatStore((s) => s.setReplyingToMessage);

  const handleSubmit = () => {
    const hasContent = Boolean(content.trim());
    const hasAttachments = attachments.length > 0;
    if ((!hasContent && !hasAttachments) || !activeChannelId) return;

    if (useChatStore.getState().activeSessionId === 'new') {
      useChatStore.getState().setActiveSessionId(null);
    }

    sendMessage(
      activeChannelId,
      content.trim(),
      replyingToMessage ? replyingToMessage.id : undefined,
      hasAttachments ? attachments : undefined
    );

    setContent('');
    setAttachments([]);
    setShowEmojiPicker(false);
    setMentionFilter(null);
    setReplyingToMessage(null);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    stopTyping(activeChannelId);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
      e.preventDefault();
      insertText('**', '**');
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
      e.preventDefault();
      insertText('*', '*');
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
      e.preventDefault();
      insertText('<u>', '</u>');
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
      e.preventDefault();
      insertText('`', '`');
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && mentionFilter === null) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);
    handleTyping();

    // Detect @mention trigger
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = val.substring(0, cursorPos);
    const mentionMatch = textBeforeCursor.match(/@([a-zA-Z0-9_]*)$/);

    if (mentionMatch) {
      setMentionFilter(mentionMatch[1]);
    } else {
      setMentionFilter(null);
    }

    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`;
    }
  };

  const insertMention = (username: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = content.substring(0, cursorPos);
    const textAfterCursor = content.substring(cursorPos);

    const newTextBefore = textBeforeCursor.replace(/@([a-zA-Z0-9_]*)$/, `@${username} `);
    setContent(newTextBefore + textAfterCursor);
    setMentionFilter(null);

    setTimeout(() => {
      textarea.focus();
    }, 0);
  };

  const insertText = (before: string, after: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.substring(start, end);
    const replacement = `${before}${selected}${after}`;

    const newContent = content.substring(0, start) + replacement + content.substring(end);
    setContent(newContent);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, end + before.length);
    }, 0);
  };

  const insertEmoji = (emoji: string) => {
    setContent((prev) => prev + emoji);
    setShowEmojiPicker(false);
    textareaRef.current?.focus();
  };

  if (!activeChannelId) return null;

  const channelName = activeChannel?.type === 'DIRECT'
    ? activeChannel.name
    : `#${activeChannel?.name || 'channel'}`;

  const hasInput = Boolean(content.trim()) || attachments.length > 0;

  const formatSecs = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="message-input-wrapper">
      <TypingIndicator channelId={activeChannelId} />

      <input
        type="file"
        ref={fileInputRef}
        multiple
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      {/* Mention Auto-Complete Popover */}
      {mentionFilter !== null && (
        <MentionPopup
          users={workspaceUsers}
          filterText={mentionFilter}
          onSelectUser={insertMention}
          onClose={() => setMentionFilter(null)}
        />
      )}

      {/* Quoted Reply Preview Header */}
      {replyingToMessage && (
        <div className="message-input__reply-banner">
          <div className="message-input__reply-info">
            <span className="message-input__reply-label">Replying to {replyingToMessage.user?.displayName || 'User'}</span>
            <span className="message-input__reply-snippet">{replyingToMessage.content}</span>
          </div>
          <button type="button" className="message-input__reply-close" onClick={() => setReplyingToMessage(null)}>
            ✕
          </button>
        </div>
      )}

      {/* Uploaded Pending Attachments Bar */}
      {(attachments.length > 0 || isUploading) && (
        <div className="message-input__attachments-bar">
          {attachments.map((att, i) => (
            <div key={i} className="attachment-chip">
              {att.fileType === 'IMAGE' ? (
                <img src={att.fileUrl} alt={att.fileName} className="attachment-chip__thumb" />
              ) : (
                <FileIcon fileType={att.fileType} fileName={att.fileName} mimeType={att.mimeType} />
              )}
              <div className="attachment-chip__info">
                <span className="attachment-chip__name">{att.fileName}</span>
                <span className="attachment-chip__size">{(att.fileSize / 1024).toFixed(1)} KB</span>
              </div>
              <button
                type="button"
                className="attachment-chip__remove"
                onClick={() => removeAttachment(i)}
                title="Remove attachment"
              >
                ×
              </button>
            </div>
          ))}

          {isUploading && (
            <div className="attachment-chip attachment-chip--uploading">
              <span className="attachment-chip__spinner" />
              <span>Uploading file...</span>
            </div>
          )}
        </div>
      )}

      {/* Main Composer Container */}
      <div
        className={`message-input__box ${isDragging ? 'message-input__box--dragging' : ''} ${isRecording ? 'message-input__box--recording' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isRecording ? (
          /* Voice Recording Mode Bar */
          <div className="message-input__recording-bar">
            <div className="message-input__recording-status">
              <span className="message-input__recording-dot" />
              <span className="message-input__recording-timer">{formatSecs(recordingSeconds)}</span>
              <div className="message-input__recording-wave">
                <span /><span /><span /><span />
              </div>
            </div>

            <div className="message-input__recording-actions">
              <button type="button" className="message-input__recording-cancel" onClick={stopVoiceRecord} title="Cancel recording">
                Cancel
              </button>
              <button type="button" className="message-input__recording-send" onClick={sendVoiceRecord} title="Send voice note">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
                <span>Send</span>
              </button>
            </div>
          </div>
        ) : (
          /* Sleek Enterprise Composer Box */
          <>
            <textarea
              ref={textareaRef}
              className="message-input__textarea"
              value={content}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${channelName}...`}
              rows={1}
            />

            <div className="message-input__bottom-bar">
              <div className="message-input__left-tools">
                {/* Attachment + Button */}
                <button
                  type="button"
                  className="message-input__tool-btn message-input__tool-btn--attach"
                  onClick={() => setShowAttachmentSheet(true)}
                  title="Add attachment or media"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>

                <div className="message-input__tool-divider" />

                {/* Formatting Shortcuts */}
                <button
                  type="button"
                  className="message-input__tool-btn message-input__tool-btn--fmt"
                  onClick={() => insertText('**', '**')}
                  title="Bold (**text** or Ctrl+B)"
                >
                  <b>B</b>
                </button>
                <button
                  type="button"
                  className="message-input__tool-btn message-input__tool-btn--fmt"
                  onClick={() => insertText('*', '*')}
                  title="Italic (*text* or Ctrl+I)"
                >
                  <i>I</i>
                </button>
                <button
                  type="button"
                  className="message-input__tool-btn message-input__tool-btn--fmt"
                  onClick={() => insertText('<u>', '</u>')}
                  title="Underline (<u>text</u> or Ctrl+U)"
                >
                  <u>U</u>
                </button>
                <button
                  type="button"
                  className="message-input__tool-btn message-input__tool-btn--fmt"
                  onClick={() => insertText('~~', '~~')}
                  title="Strikethrough (~~text~~)"
                >
                  <s>S</s>
                </button>
                <button
                  type="button"
                  className="message-input__tool-btn message-input__tool-btn--fmt"
                  onClick={() => insertText('`', '`')}
                  title="Code (`code` or Ctrl+E)"
                >
                  <code>{'</>'}</code>
                </button>

                <div className="message-input__tool-divider" />

                {/* Vector Emoji Trigger */}
                <div className="message-input__emoji-trigger-container">
                  <button
                    type="button"
                    className={`message-input__tool-btn ${showEmojiPicker ? 'message-input__tool-btn--active' : ''}`}
                    onClick={() => setShowEmojiPicker((prev) => !prev)}
                    title="Add Emoji"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                      <line x1="9" y1="9" x2="9.01" y2="9" />
                      <line x1="15" y1="9" x2="15.01" y2="9" />
                    </svg>
                  </button>

                  {showEmojiPicker && (
                    <div className="message-input__emoji-popover">
                      <EmojiPicker
                        onSelectEmoji={insertEmoji}
                        onClose={() => setShowEmojiPicker(false)}
                      />
                    </div>
                  )}
                </div>


              </div>

              {/* Enterprise Send Button */}
              <button
                type="button"
                className={`message-input__send-btn ${hasInput ? 'message-input__send-btn--active' : ''}`}
                onClick={handleSubmit}
                disabled={!hasInput || isUploading}
                title="Send message (Enter)"
              >
                <span>Send</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Attachment Bottom Sheet */}
      <AttachmentSheet
        isOpen={showAttachmentSheet}
        onClose={() => setShowAttachmentSheet(false)}
        onSelectPhoto={() => fileInputRef.current?.click()}
        onSelectDocument={() => fileInputRef.current?.click()}
      />
    </div>
  );
}
