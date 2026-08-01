import { Check, Copy } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface CodeBlockProps extends React.HTMLAttributes<HTMLPreElement> {
  code: string;
  language?: string;
}

export const CodeBlock = React.forwardRef<HTMLPreElement, CodeBlockProps>(
  ({ className, code, language, ...props }, ref) => {
    const [hasCopied, setHasCopied] = React.useState(false);

    React.useEffect(() => {
      if (hasCopied) {
        const timer = setTimeout(() => setHasCopied(false), 2000);
        return () => clearTimeout(timer);
      }
    }, [hasCopied]);

    const copyToClipboard = React.useCallback(async () => {
      if (typeof window === 'undefined' || !navigator.clipboard?.writeText) return;
      await navigator.clipboard.writeText(code);
      setHasCopied(true);
    }, [code]);

    return (
      <div className="relative w-full overflow-hidden border rounded-lg group bg-zinc-950 dark:bg-zinc-900 text-zinc-50">
        {/* Header toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
          <span className="font-mono text-xs lowercase text-zinc-400">{language || 'code'}</span>

          {/* Copy button wrapped in shadcn tooltip */}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800"
                  onClick={copyToClipboard}
                >
                  {hasCopied ? (
                    <Check className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  <span className="sr-only">Copy code</span>
                </Button>
              }
            />
            <TooltipContent side="left">
              <p>{hasCopied ? 'Copied!' : 'Copy code'}</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Scrollable container for pre/code */}
        <ScrollArea className="w-full max-h-112.5">
          <pre
            ref={ref}
            className={cn('p-4 font-mono text-sm leading-relaxed overflow-x-auto', className)}
            {...props}
          >
            <code className={cn('block w-full language-' + language)}>{code.trim()}</code>
          </pre>
        </ScrollArea>
      </div>
    );
  },
);

CodeBlock.displayName = 'CodeBlock';
