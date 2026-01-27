import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Bold, Italic, List, ListOrdered, Undo, Redo } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RichTextEditorProps {
  content?: string;
  onChange?: (html: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  editorClassName?: string;
  minHeight?: string;
}

function ToolbarButton({ 
  onClick, 
  isActive, 
  children,
  title
}: { 
  onClick: () => void; 
  isActive?: boolean;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn(
        "h-7 w-7 p-0",
        isActive && "bg-muted text-primary"
      )}
      onClick={onClick}
      title={title}
    >
      {children}
    </Button>
  );
}

function Toolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;

  return (
    <div className="flex items-center gap-0.5 border-b p-1 bg-muted/30">
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive('bold')}
        title="Bold"
      >
        <Bold className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive('italic')}
        title="Italic"
      >
        <Italic className="h-4 w-4" />
      </ToolbarButton>
      <div className="w-px h-5 bg-border mx-1" />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive('bulletList')}
        title="Bullet List"
      >
        <List className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive('orderedList')}
        title="Numbered List"
      >
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>
      <div className="w-px h-5 bg-border mx-1" />
      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        title="Undo"
      >
        <Undo className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        title="Redo"
      >
        <Redo className="h-4 w-4" />
      </ToolbarButton>
    </div>
  );
}

export function RichTextEditor({
  content = '',
  onChange,
  onBlur,
  placeholder = 'Start typing...',
  className,
  editorClassName,
  minHeight = '120px',
}: RichTextEditorProps) {
  const initialContentRef = useRef(content);
  const hasLoadedRef = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: '',
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
    },
    onBlur: () => {
      onBlur?.();
    },
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm prose-invert max-w-none focus:outline-none p-3',
          editorClassName
        ),
        style: `min-height: ${minHeight}`,
      },
    },
  });

  useEffect(() => {
    if (editor && content && !hasLoadedRef.current) {
      editor.commands.setContent(content);
      hasLoadedRef.current = true;
    }
  }, [editor, content]);

  useEffect(() => {
    if (editor && content !== initialContentRef.current && hasLoadedRef.current) {
      const currentContent = editor.getHTML();
      if (content !== currentContent && content) {
        editor.commands.setContent(content);
      }
    }
  }, [editor, content]);

  return (
    <div className={cn('rounded-md border bg-background', className)}>
      <Toolbar editor={editor} />
      <EditorContent editor={editor} data-testid="rich-text-editor" />
    </div>
  );
}

export function RichTextDisplay({ content, className }: { content: string; className?: string }) {
  return (
    <div 
      className={cn('prose prose-sm prose-invert max-w-none', className)}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}
