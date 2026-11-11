// Fork: the register as one transaction at a time. A short list on the left
// (sorted and filtered by the page's own search, Filter button and the sort
// menu here); the picked transaction fills the right, amount large, with the
// everyday categories as a grid showing what's left in each this month.
// ↑ ↓ move, Enter saves and moves on, N starts a new transaction.
// Splits are shown but edited in the classic table.
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Input } from '@actual-app/components/input';
import { Select } from '@actual-app/components/select';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';
import * as monthUtils from '@actual-app/core/shared/months';
import type {
  AccountEntity,
  CategoryGroupEntity,
  PayeeEntity,
  TransactionEntity,
} from '@actual-app/core/types/models';
import { css } from '@emotion/css';

import { useLocale } from '#hooks/useLocale';

import { cell, useCells } from './EnvelopeRowParts';
import { usd, usePlan } from './moneyPlan';

export type RegisterSort = { field: string; ascDesc: 'asc' | 'desc' } | null;

const SORTS: [string, string, 'asc' | 'desc'][] = [
  ['newest', 'date', 'desc'],
  ['oldest', 'date', 'asc'],
  ['spent', 'amount', 'asc'],
  ['in', 'amount', 'desc'],
  ['payee', 'payee', 'asc'],
  ['category', 'category', 'asc'],
];

const layout = css({
  display: 'grid',
  gridTemplateColumns: 'minmax(280px, 1fr) minmax(0, 1.25fr)',
  flex: 1,
  minHeight: 0,
  borderTop: `1px solid ${theme.tableBorder}`,
  '@media (max-width: 820px)': {
    gridTemplateColumns: 'minmax(0, 1fr)',
    gridTemplateRows: 'minmax(220px, 40%) minmax(0, 1fr)',
  },
});
const item = css({
  all: 'unset',
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  width: '100%',
  padding: '10px 12px',
  borderRadius: 12,
  cursor: 'pointer',
  ':hover': { backgroundColor: theme.surfaceSunken },
  ':focus-visible': {
    outline: `2px solid ${theme.formInputBorderSelected}`,
    outlineOffset: -2,
  },
});
const catGrid = css({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
  gap: 8,
});
const catButton = css({
  all: 'unset',
  boxSizing: 'border-box',
  cursor: 'pointer',
  borderRadius: 12,
  padding: 12,
  fontWeight: 600,
  backgroundColor: theme.cardBackground,
  transition: 'transform .12s, background-color .15s',
  ':hover': { backgroundColor: theme.surfaceSunken },
  ':active': { transform: 'scale(0.97)' },
  ':focus-visible': {
    outline: `2px solid ${theme.formInputBorderSelected}`,
    outlineOffset: 2,
  },
});
const label = { fontSize: 12, fontWeight: 600, color: theme.pageTextSubdued };

type Draft = {
  payee: string;
  amount: string;
  out: boolean;
  date: string;
  notes: string;
  account: string;
};

type Props = {
  transactions: readonly TransactionEntity[];
  accounts: readonly AccountEntity[];
  payees: readonly PayeeEntity[];
  categoryGroups: readonly CategoryGroupEntity[];
  /** A real account id, or undefined / a pseudo-account for combined views. */
  accountId?: string;
  sort: RegisterSort;
  isFiltered: boolean;
  onSort: (field: string, ascDesc: 'asc' | 'desc') => void;
  onLoadMore: () => void;
  onRefetch: () => void;
  onShowClassic: () => void;
  /** The page's own "Add transaction" was pressed. */
  adding: boolean;
  onAddHandled: () => void;
};

export function FocusRegister({
  transactions,
  accounts,
  payees,
  categoryGroups,
  accountId,
  sort,
  isFiltered,
  onSort,
  onLoadMore,
  onRefetch,
  onShowClassic,
  adding,
  onAddHandled,
}: Props) {
  const { t } = useTranslation();
  const locale = useLocale();
  const plan = usePlan();
  const listRef = useRef<HTMLDivElement>(null);

  const rows = transactions.filter(tx => !tx.is_child);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    if (adding) {
      setCreating(true);
      onAddHandled();
    }
  }, [adding, onAddHandled]);
  const selected = creating
    ? null
    : (rows.find(r => r.id === selectedId) ?? rows[0] ?? null);

  const realAccount = accounts.find(a => a.id === accountId);
  const payeeById = new Map(payees.map(p => [p.id, p]));
  const categories = categoryGroups
    .filter(g => !g.is_income && !g.hidden)
    .flatMap(g => (g.categories ?? []).filter(c => !c.hidden));
  const incomeCategories = categoryGroups
    .filter(g => g.is_income)
    .flatMap(g => g.categories ?? []);
  const catName = new Map(
    [...categories, ...incomeCategories].map(c => [c.id, c.name]),
  );
  const accountName = new Map(accounts.map(a => [a.id, a.name]));

  const payeeName = (tx: TransactionEntity) => {
    const p = tx.payee ? payeeById.get(tx.payee) : undefined;
    if (p?.transfer_acct) {
      return t('Transfer: {{account}}', {
        account: accountName.get(p.transfer_acct) ?? '',
      });
    }
    return p?.name || tx.imported_payee || t('No payee');
  };
  const isTransfer = (tx: TransactionEntity) =>
    !!(tx.payee && payeeById.get(tx.payee)?.transfer_acct);
  const children = (tx: TransactionEntity) =>
    transactions.filter(c => c.parent_id === tx.id);
  const categoryText = (tx: TransactionEntity) =>
    tx.is_parent
      ? t('Split')
      : tx.category
        ? (catName.get(tx.category) ?? '')
        : isTransfer(tx)
          ? t('Transfer')
          : null;

  // ── the detail draft ───────────────────────────────────────────────────
  const blank = (): Draft => ({
    payee: '',
    amount: '',
    out: true,
    date: monthUtils.currentDay(),
    notes: '',
    account:
      realAccount?.id ??
      accounts.find(a => !a.closed && !a.offbudget)?.id ??
      '',
  });
  const fromTx = (tx: TransactionEntity): Draft => ({
    payee: payeeById.get(tx.payee ?? '')?.name ?? tx.imported_payee ?? '',
    amount: (Math.abs(tx.amount) / 100).toFixed(2),
    out: tx.amount <= 0,
    date: tx.date,
    notes: tx.notes ?? '',
    account: tx.account,
  });
  const [draft, setDraft] = useState<Draft>(blank);
  const draftKey = creating ? 'new' : (selected?.id ?? '');
  useEffect(() => {
    setDraft(creating || !selected ? blank() : fromTx(selected));
    // only when the picked transaction changes, not on every live refresh
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  const cents = () => {
    const v = Math.round(
      parseFloat(draft.amount.replace(/[^0-9.]/g, '')) * 100,
    );
    return Number.isFinite(v) ? (draft.out ? -v : v) : 0;
  };
  const payeeIdFor = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const found = payees.find(
      p => !p.transfer_acct && p.name.toLowerCase() === trimmed.toLowerCase(),
    );
    return found ? found.id : await send('payee-create', { name: trimmed });
  };

  const move = (dir: number) => {
    if (!rows.length) return;
    const i = selected ? rows.findIndex(r => r.id === selected.id) : -1;
    const next = rows[Math.max(0, Math.min(rows.length - 1, i + dir))];
    setCreating(false);
    setSelectedId(next.id);
    listRef.current
      ?.querySelector(`[data-id="${next.id}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  };

  const save = async (advance: boolean) => {
    if (creating) {
      if (!cents() || !draft.account) return;
      const id = crypto.randomUUID();
      await send('transactions-batch-update', {
        added: [
          {
            id,
            account: draft.account,
            date: draft.date,
            amount: cents(),
            payee: await payeeIdFor(draft.payee),
            notes: draft.notes || undefined,
          },
        ],
      });
      setCreating(false);
      setSelectedId(id);
      onRefetch();
      return;
    }
    if (!selected) return;
    const before = fromTx(selected);
    const changes: Partial<TransactionEntity> = {};
    if (draft.payee !== before.payee) {
      changes.payee = await payeeIdFor(draft.payee);
    }
    if (!selected.is_parent && cents() !== selected.amount) {
      changes.amount = cents();
    }
    if (draft.date !== before.date) changes.date = draft.date;
    if (draft.notes !== before.notes) changes.notes = draft.notes;
    if (Object.keys(changes).length) {
      await send('transactions-batch-update', {
        updated: [{ id: selected.id, ...changes }],
      });
      onRefetch();
    }
    if (advance) move(1);
  };

  const file = async (category: string) => {
    if (!selected || selected.is_parent) return;
    await send('transactions-batch-update', {
      updated: [{ id: selected.id, category }],
    });
    onRefetch();
  };

  const remove = async () => {
    if (!selected) return;
    if (!window.confirm(t('Delete this transaction? You can undo with ⌘Z.'))) {
      return;
    }
    const i = rows.findIndex(r => r.id === selected.id);
    await send('transactions-batch-update', {
      deleted: [{ id: selected.id } as TransactionEntity],
    });
    setSelectedId(rows[i + 1]?.id ?? rows[i - 1]?.id ?? null);
    onRefetch();
  };

  // keyboard: arrows move, Enter saves and moves on, N adds
  const keys = useRef({ move, save, setCreating });
  keys.current = { move, save, setCreating };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.closest('input, textarea, select, [role="dialog"]');
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Enter' && el.closest('[data-focus-pane] input')) {
        e.preventDefault();
        void keys.current.save(true);
        return;
      }
      if (typing) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        keys.current.move(e.key === 'ArrowDown' ? 1 : -1);
      } else if (e.key === 'Enter' && !el.closest('button')) {
        void keys.current.save(true);
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        keys.current.setCreating(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── category grid: the plan's everyday categories, with this month's left
  const month = monthUtils.monthFromDate(
    selected?.date ?? monthUtils.currentDay(),
  );
  const byName = new Map(categories.map(c => [c.name, c]));
  const gridCats = (
    plan?.everyday?.length
      ? plan.everyday.map(n => byName.get(n)).filter(c => !!c)
      : categories.slice(0, 9)
  ).slice(0, 12);
  const cells = useCells(
    gridCats.flatMap(c => [
      cell(month, `budget-${c.id}`),
      cell(month, `sum-amount-${c.id}`),
    ]),
  );
  const leftIn = (id: string) =>
    (cells[cell(month, `budget-${id}`)] ?? 0) +
    (cells[cell(month, `sum-amount-${id}`)] ?? 0);

  const sortKey =
    SORTS.find(([, f, d]) => f === sort?.field && d === sort?.ascDesc)?.[0] ??
    'newest';
  const sortLabels: Record<string, string> = {
    newest: t('Newest first'),
    oldest: t('Oldest first'),
    spent: t('Biggest spending'),
    in: t('Biggest money in'),
    payee: t('Payee A–Z'),
    category: t('Category A–Z'),
  };
  const fmtDate = (d: string, f: string) => monthUtils.format(d, f, locale);

  return (
    <div className={layout}>
      {/* ── list ── */}
      <View
        style={{
          minHeight: 0,
          borderRight: `1px solid ${theme.tableBorder}`,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            padding: '12px 14px 8px',
          }}
        >
          <Select
            aria-label={t('Sort')}
            value={sortKey}
            onChange={key => {
              const s = SORTS.find(([k]) => k === key);
              if (s) onSort(s[1], s[2]);
            }}
            options={SORTS.map(([k]) => [k, sortLabels[k]] as const)}
          />
          <Text style={{ fontSize: 13, color: theme.pageTextSubdued }}>
            {isFiltered
              ? t('{{n}} matching', { n: rows.length })
              : t('{{n}} shown', { n: rows.length })}
          </Text>
          <View style={{ flex: 1 }} />
          <Button variant="normal" onPress={() => setCreating(true)}>
            <Trans>New</Trans>
          </Button>
        </View>
        <div
          ref={listRef}
          role="listbox"
          aria-label={t('Transactions')}
          style={{ overflowY: 'auto', flex: 1, padding: '0 10px 16px' }}
        >
          {rows.length === 0 && (
            <Text style={{ padding: 14, color: theme.pageTextSubdued }}>
              {isFiltered ? (
                <Trans>Nothing matches the search or filter.</Trans>
              ) : (
                <Trans>No transactions yet. Press N to add one.</Trans>
              )}
            </Text>
          )}
          {rows.map(tx => {
            const on = !creating && tx.id === selected?.id;
            const cat = categoryText(tx);
            return (
              <button
                key={tx.id}
                type="button"
                role="option"
                aria-selected={on}
                data-id={tx.id}
                className={item}
                onClick={() => {
                  setCreating(false);
                  setSelectedId(tx.id);
                }}
                style={
                  on
                    ? {
                        backgroundColor: theme.pageText,
                        color: theme.pageBackground,
                      }
                    : undefined
                }
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={{
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      color: 'inherit',
                    }}
                  >
                    {payeeName(tx)}
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      color: on ? 'inherit' : theme.pageTextSubdued,
                      opacity: on ? 0.7 : 1,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {fmtDate(tx.date, 'MMM d')}
                    {!realAccount && ` · ${accountName.get(tx.account) ?? ''}`}
                    {' · '}
                    {cat ?? (
                      <span
                        style={{
                          color: on ? 'inherit' : theme.warningText,
                          fontWeight: 600,
                        }}
                      >
                        <Trans>Needs a category</Trans>
                      </span>
                    )}
                  </Text>
                </View>
                <Text
                  style={{
                    ...styles.tnum,
                    fontWeight: 600,
                    color: on
                      ? 'inherit'
                      : tx.amount > 0
                        ? theme.noticeText
                        : theme.pageText,
                  }}
                >
                  {tx.amount > 0 ? '+' : ''}
                  {usd(tx.amount / 100, true)}
                </Text>
              </button>
            );
          })}
          {rows.length > 0 && (
            <View style={{ alignItems: 'center', padding: 10 }}>
              <Button variant="bare" onPress={onLoadMore}>
                <Trans>Show older</Trans>
              </Button>
            </View>
          )}
        </div>
      </View>

      {/* ── the picked transaction ── */}
      <div
        data-focus-pane
        style={{ overflowY: 'auto', padding: '28px 34px 40px', minHeight: 0 }}
      >
        {!creating && !selected ? null : (
          <View style={{ gap: 22, maxWidth: 640 }}>
            <View>
              <Text style={{ fontSize: 13, color: theme.pageTextSubdued }}>
                {creating
                  ? t('New transaction')
                  : `${fmtDate(selected!.date, 'EEEE, MMMM d')} · ${accountName.get(selected!.account) ?? ''}`}
              </Text>
              <Text
                style={{
                  ...styles.tnum,
                  fontSize: 60,
                  fontWeight: 550,
                  letterSpacing: '-0.042em',
                  lineHeight: 1,
                  marginTop: 10,
                  color: !draft.out ? theme.noticeText : theme.pageText,
                }}
              >
                {draft.out ? '' : '+'}
                {usd(cents() / 100, true)}
              </Text>
              {!creating && selected?.imported_payee && (
                <Text
                  style={{
                    fontSize: 13,
                    color: theme.pageTextSubdued,
                    marginTop: 8,
                  }}
                >
                  {t("Bank's text: {{text}}", {
                    text: selected.imported_payee,
                  })}
                </Text>
              )}
            </View>

            <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
              <Field label={t('Payee')} grow>
                <Input
                  value={draft.payee}
                  list="focus-payees"
                  placeholder={t('Who was it?')}
                  onChangeValue={payee => setDraft(d => ({ ...d, payee }))}
                />
                <datalist id="focus-payees">
                  {payees
                    .filter(p => !p.transfer_acct)
                    .map(p => (
                      <option key={p.id} value={p.name} />
                    ))}
                </datalist>
              </Field>
              <Field label={t('Amount')}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Input
                    value={draft.amount}
                    inputMode="decimal"
                    placeholder="0.00"
                    disabled={!!selected?.is_parent && !creating}
                    onChangeValue={amount => setDraft(d => ({ ...d, amount }))}
                    style={{ ...styles.tnum, width: 110 }}
                  />
                  <Button
                    variant="bare"
                    aria-label={
                      draft.out
                        ? t('Switch to money in')
                        : t('Switch to money out')
                    }
                    onPress={() => setDraft(d => ({ ...d, out: !d.out }))}
                  >
                    {draft.out ? t('Out') : t('In')}
                  </Button>
                </View>
              </Field>
              <Field label={t('Date')}>
                <Input
                  type="date"
                  value={draft.date}
                  onChangeValue={date => setDraft(d => ({ ...d, date }))}
                />
              </Field>
              {creating && !realAccount && (
                <Field label={t('Account')}>
                  <Select
                    value={draft.account}
                    onChange={account => setDraft(d => ({ ...d, account }))}
                    options={accounts
                      .filter(a => !a.closed)
                      .map(a => [a.id, a.name] as const)}
                  />
                </Field>
              )}
            </View>

            {!creating && selected && (
              <View>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    marginBottom: 10,
                  }}
                >
                  <Text style={{ fontWeight: 600 }}>
                    <Trans>Category</Trans>
                  </Text>
                  {!selected.is_parent && (
                    <Text
                      style={{ fontSize: 13, color: theme.pageTextSubdued }}
                    >
                      {t('left in {{month}} under each', {
                        month: fmtDate(month, 'MMMM'),
                      })}
                    </Text>
                  )}
                </View>
                {selected.is_parent ? (
                  <View style={{ gap: 6 }}>
                    {children(selected).map(c => (
                      <View
                        key={c.id}
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                        }}
                      >
                        <Text>{categoryText(c) ?? t('Needs a category')}</Text>
                        <Text style={styles.tnum}>
                          {usd(c.amount / 100, true)}
                        </Text>
                      </View>
                    ))}
                    <View style={{ alignItems: 'flex-start', marginTop: 6 }}>
                      <Button variant="bare" onPress={onShowClassic}>
                        <Trans>Edit the split in the classic table</Trans>
                      </Button>
                    </View>
                  </View>
                ) : (
                  <>
                    <div className={catGrid}>
                      {gridCats.map(c => {
                        const on = selected.category === c.id;
                        const left = leftIn(c.id);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            className={catButton}
                            aria-pressed={on}
                            onClick={() => void file(c.id)}
                            style={
                              on
                                ? {
                                    backgroundColor: theme.reportsChartFill,
                                    color: theme.pageBackground,
                                  }
                                : undefined
                            }
                          >
                            {c.name}
                            <span
                              style={{
                                ...styles.tnum,
                                display: 'block',
                                fontSize: 12,
                                fontWeight: 500,
                                marginTop: 2,
                                color: on
                                  ? 'inherit'
                                  : left < 0
                                    ? theme.errorText
                                    : theme.pageTextSubdued,
                              }}
                            >
                              {left < 0
                                ? t('{{amount}} over', {
                                    amount: usd(-left / 100),
                                  })
                                : t('{{amount}} left', {
                                    amount: usd(left / 100),
                                  })}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <View
                      style={{
                        flexDirection: 'row',
                        gap: 8,
                        alignItems: 'center',
                        marginTop: 10,
                      }}
                    >
                      <Text
                        style={{ fontSize: 13, color: theme.pageTextSubdued }}
                      >
                        <Trans>Something else:</Trans>
                      </Text>
                      <Select
                        aria-label={t('Any category')}
                        value={selected.category ?? ''}
                        defaultLabel={t('Choose a category')}
                        onChange={id => void file(id)}
                        options={[...categories, ...incomeCategories].map(
                          c => [c.id, c.name] as const,
                        )}
                      />
                    </View>
                  </>
                )}
              </View>
            )}

            <Field label={t('Notes')}>
              <Input
                value={draft.notes}
                placeholder={t('Add a note')}
                onChangeValue={notes => setDraft(d => ({ ...d, notes }))}
              />
            </Field>

            <View
              style={{
                flexDirection: 'row',
                gap: 10,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <Button variant="primary" onPress={() => void save(!creating)}>
                {creating ? <Trans>Add</Trans> : <Trans>Save and next</Trans>}
              </Button>
              {creating ? (
                <Button variant="bare" onPress={() => setCreating(false)}>
                  <Trans>Cancel</Trans>
                </Button>
              ) : (
                <Button variant="bare" onPress={() => void remove()}>
                  <Trans>Delete</Trans>
                </Button>
              )}
              <View style={{ flex: 1 }} />
              <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
                <Trans>↑ ↓ to move · Enter to save · N for new</Trans>
              </Text>
            </View>
          </View>
        )}
      </div>
    </div>
  );
}

function Field({
  label: text,
  grow,
  children,
}: {
  label: string;
  grow?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={{ gap: 5, flex: grow ? '1 1 220px' : undefined }}>
      <Text style={label}>{text}</Text>
      {children}
    </View>
  );
}
