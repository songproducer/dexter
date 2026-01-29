import React, { useEffect, useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';

import { colors } from '../theme.js';
import { useTextBuffer } from '../hooks/useTextBuffer.js';
import { cursorHandlers } from '../utils/input-key-handlers.js';
import { CursorText } from './CursorText.js';

// Command definition
interface Command {
  name: string;
  description: string;
  template?: string; // If set, Tab inserts this instead of name
}

// Available commands with descriptions
const COMMANDS: Command[] = [
  { name: '/model', description: 'Switch LLM provider/model' },
  { name: '/exa-docs', description: 'Show Exa search parameter reference' },
  // Search templates - user fills in the topic after Tab
  { name: '/tweets', description: 'Search Twitter/X', template: 'latest tweets about ' },
  { name: '/news', description: 'Search recent news', template: 'latest news about ' },
  { name: '/news24h', description: 'News from last 24 hours', template: 'news from the last 24 hours about ' },
  { name: '/papers', description: 'Search research papers', template: 'research papers on ' },
  { name: '/arxiv', description: 'Search arXiv papers', template: 'arxiv research papers on ' },
  { name: '/github', description: 'Search GitHub repos', template: 'github repositories for ' },
  { name: '/pdf', description: 'Search PDFs/whitepapers', template: 'pdf whitepaper about ' },
  { name: '/sec', description: 'Search SEC filings', template: 'SEC 10-K filing for ' },
];

interface InputProps {
  onSubmit: (value: string) => void;
  /** Value from history navigation (null = user typing fresh input) */
  historyValue?: string | null;
  /** Callback when user presses up/down arrow for history navigation */
  onHistoryNavigate?: (direction: 'up' | 'down') => void;
}

export function Input({ onSubmit, historyValue, onHistoryNavigate }: InputProps) {
  const { text, cursorPosition, actions } = useTextBuffer();
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);

  // Filter commands based on current input
  const suggestions = useMemo(() => {
    if (!text.startsWith('/')) return [];
    const query = text.toLowerCase();
    return COMMANDS.filter(cmd => cmd.name.toLowerCase().startsWith(query));
  }, [text]);

  // Reset selection when suggestions change
  useEffect(() => {
    setSelectedSuggestion(0);
  }, [suggestions.length]);

  // Update input buffer when history navigation changes
  useEffect(() => {
    if (historyValue === null) {
      // Returned to typing mode - clear input for fresh entry
      actions.clear();
    } else if (historyValue !== undefined) {
      // Navigating history - show the historical message
      actions.setValue(historyValue);
    }
  }, [historyValue]);

  // Handle all input
  useInput((input, key) => {
    const ctx = { text, cursorPosition };

    // Tab: autocomplete selected suggestion
    if (key.tab && suggestions.length > 0) {
      const selected = suggestions[selectedSuggestion];
      if (selected) {
        // Use template if available (for search shortcuts), otherwise use command name
        actions.setValue(selected.template ?? selected.name);
      }
      return;
    }

    // Up arrow: navigate suggestions if visible, else cursor/history
    if (key.upArrow) {
      if (suggestions.length > 0) {
        setSelectedSuggestion(prev => Math.max(0, prev - 1));
        return;
      }
      const newPos = cursorHandlers.moveUp(ctx);
      if (newPos !== null) {
        actions.moveCursor(newPos);
      } else if (onHistoryNavigate) {
        onHistoryNavigate('up');
      }
      return;
    }

    // Down arrow: navigate suggestions if visible, else cursor/history
    if (key.downArrow) {
      if (suggestions.length > 0) {
        setSelectedSuggestion(prev => Math.min(suggestions.length - 1, prev + 1));
        return;
      }
      const newPos = cursorHandlers.moveDown(ctx);
      if (newPos !== null) {
        actions.moveCursor(newPos);
      } else if (onHistoryNavigate) {
        onHistoryNavigate('down');
      }
      return;
    }

    // Cursor movement - left arrow (plain, no modifiers)
    if (key.leftArrow && !key.ctrl && !key.meta) {
      actions.moveCursor(cursorHandlers.moveLeft(ctx));
      return;
    }

    // Cursor movement - right arrow (plain, no modifiers)
    if (key.rightArrow && !key.ctrl && !key.meta) {
      actions.moveCursor(cursorHandlers.moveRight(ctx));
      return;
    }

    // Ctrl+A - move to beginning of current line
    if (key.ctrl && input === 'a') {
      actions.moveCursor(cursorHandlers.moveToLineStart(ctx));
      return;
    }

    // Ctrl+E - move to end of current line
    if (key.ctrl && input === 'e') {
      actions.moveCursor(cursorHandlers.moveToLineEnd(ctx));
      return;
    }

    // Option+Left (Mac) / Ctrl+Left (Windows) / Alt+B - word backward
    if ((key.meta && key.leftArrow) || (key.ctrl && key.leftArrow) || (key.meta && input === 'b')) {
      actions.moveCursor(cursorHandlers.moveWordBackward(ctx));
      return;
    }

    // Option+Right (Mac) / Ctrl+Right (Windows) / Alt+F - word forward
    if ((key.meta && key.rightArrow) || (key.ctrl && key.rightArrow) || (key.meta && input === 'f')) {
      actions.moveCursor(cursorHandlers.moveWordForward(ctx));
      return;
    }

    // Option+Backspace (Mac) / Ctrl+Backspace (Windows) - delete word backward
    if ((key.meta || key.ctrl) && (key.backspace || key.delete)) {
      actions.deleteWordBackward();
      return;
    }

    // Handle backspace/delete - delete character before cursor
    if (key.backspace || key.delete) {
      actions.deleteBackward();
      return;
    }

    // Shift+Enter - insert newline for multi-line input
    if (key.return && key.shift) {
      actions.insert('\n');
      return;
    }

    // Handle submit (plain Enter)
    if (key.return) {
      const val = text.trim();
      if (val) {
        onSubmit(val);
        actions.clear();
      }
      return;
    }

    // Handle regular character input - insert at cursor position
    if (input && !key.ctrl && !key.meta) {
      actions.insert(input);
    }
  });

  return (
    <Box
      flexDirection="column"
      marginBottom={1}
      borderStyle="single"
      borderColor={colors.mutedDark}
      borderLeft={false}
      borderRight={false}
      width="100%"
    >
      {/* Command suggestions dropdown */}
      {suggestions.length > 0 && (
        <Box flexDirection="column" paddingX={1} paddingBottom={1}>
          {suggestions.map((cmd, idx) => (
            <Box key={cmd.name}>
              <Text color={idx === selectedSuggestion ? colors.primaryLight : colors.muted}>
                {idx === selectedSuggestion ? '› ' : '  '}
                {cmd.name}
              </Text>
              <Text color={colors.mutedDark}> — {cmd.description}</Text>
              {cmd.template && idx === selectedSuggestion && (
                <Text color={colors.mutedDark} dimColor> → "{cmd.template}..."</Text>
              )}
            </Box>
          ))}
          <Text color={colors.mutedDark} dimColor>
            ↑↓ select · tab complete · enter run
          </Text>
        </Box>
      )}
      <Box paddingX={1}>
        <Text color={colors.primary} bold>
          {'> '}
        </Text>
        <CursorText text={text} cursorPosition={cursorPosition} />
      </Box>
    </Box>
  );
}
