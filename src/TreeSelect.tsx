// import generate, { TreeSelectProps } from './generate';
import * as React from 'react';
import { BaseSelect } from 'rc-select';
import type {
  BaseSelectRef,
  BaseSelectPropsWithoutPrivate,
  BaseSelectProps,
  SelectProps,
} from 'rc-select';
import { conductCheck } from 'rc-tree/lib/utils/conductUtil';
import useId from 'rc-select/lib/hooks/useId';
import useMergedState from 'rc-util/lib/hooks/useMergedState';
import OptionList from './OptionList';
import TreeNode from './TreeNode';
import { formatStrategyKeys, SHOW_ALL, SHOW_PARENT, SHOW_CHILD } from './utils/strategyUtil';
import type { CheckedStrategy } from './utils/strategyUtil';
import TreeSelectContext from './TreeSelectContext';
import type { TreeSelectContextProps } from './TreeSelectContext';
import LegacyContext from './LegacyContext';
import useTreeData from './hooks/useTreeData';
import {
  flattenOptions,
  filterOptions,
  isValueDisabled,
  findValueOption,
  addValue,
  removeValue,
  getRawValueLabeled,
  toArray,
  fillFieldNames,
} from './utils/valueUtil';
import useCache from './hooks/useCache';
import useRefFunc from './hooks/useRefFunc';
import useChange from './hooks/useChange';
import useDataEntities from './hooks/useDataEntities';
import { fillAdditionalInfo } from './utils/legacyUtil';

export type OnInternalSelect = (value: RawValueType, info: { selected: boolean }) => void;

export type RawValueType = string | number;

export interface LabeledValueType {
  key?: React.Key;
  value?: RawValueType;
  label?: React.ReactNode;
  /** Only works on `treeCheckStrictly` */
  halfChecked?: boolean;
}

export type SelectSource = 'option' | 'selection' | 'input' | 'clear';

export type ValueType = RawValueType | LabeledValueType | (RawValueType | LabeledValueType)[];

/** @deprecated This is only used for legacy compatible. Not works on new code. */
export interface LegacyCheckedNode {
  pos: string;
  node: React.ReactElement;
  children?: LegacyCheckedNode[];
}

export interface ChangeEventExtra {
  /** @deprecated Please save prev value by control logic instead */
  preValue: LabeledValueType[];
  triggerValue: RawValueType;
  /** @deprecated Use `onSelect` or `onDeselect` instead. */
  selected?: boolean;
  /** @deprecated Use `onSelect` or `onDeselect` instead. */
  checked?: boolean;

  // Not sure if exist user still use this. We have to keep but not recommend user to use
  /** @deprecated This prop not work as react node anymore. */
  triggerNode: React.ReactElement;
  /** @deprecated This prop not work as react node anymore. */
  allCheckedNodes: LegacyCheckedNode[];
}

export interface FieldNames {
  value?: string;
  label?: string;
  children?: string;
}

export interface InternalFieldName extends Omit<FieldNames, 'label'> {
  _title: string[];
}

export interface SimpleModeConfig {
  id?: React.Key;
  pId?: React.Key;
  rootPId?: React.Key;
}

export interface BaseOptionType {
  disabled?: boolean;
  checkable?: boolean;
  disableCheckbox?: boolean;
  children?: BaseOptionType[];
  [name: string]: any;
}

export interface DefaultOptionType extends BaseOptionType {
  value?: RawValueType;
  title?: React.ReactNode;
  label?: React.ReactNode;
  key?: React.Key;
  children?: DefaultOptionType[];
}

export interface LegacyDataNode extends DefaultOptionType {
  props: any;
}
export interface TreeSelectProps<OptionType extends BaseOptionType = DefaultOptionType>
  extends Omit<BaseSelectPropsWithoutPrivate, 'mode'> {
  prefixCls?: string;
  id?: string;

  // >>> Value
  value?: ValueType;
  defaultValue?: ValueType;
  onChange?: (value: ValueType, labelList: React.ReactNode[], extra: ChangeEventExtra) => void;

  // >>> Search
  searchValue?: string;
  /** @deprecated Use `searchValue` instead */
  inputValue?: string;
  onSearch?: (value: string) => void;
  autoClearSearchValue?: boolean;

  // >>> Select
  onSelect?: SelectProps<OptionType>['onSelect'];

  // >>> Selector
  showCheckedStrategy?: CheckedStrategy;
  treeNodeLabelProp?: string;

  // >>> Field Names
  fieldNames?: FieldNames;

  // >>> Mode
  multiple?: boolean;
  treeCheckable?: boolean | React.ReactNode;
  treeCheckStrictly?: boolean;
  labelInValue?: boolean;

  // >>> Data
  treeData?: OptionType[];
  treeDataSimpleMode?: boolean | SimpleModeConfig;
  loadData?: (dataNode: LegacyDataNode) => Promise<unknown>;
  treeLoadedKeys?: React.Key[];
  onTreeLoad?: (loadedKeys: React.Key[]) => void;

  // >>> Options
  virtual?: boolean;
  listHeight?: number;
  listItemHeight?: number;
}

function isRawValue(value: RawValueType | LabeledValueType): value is RawValueType {
  return !value || typeof value !== 'object';
}

const TreeSelect = React.forwardRef<BaseSelectRef, TreeSelectProps>((props, ref) => {
  const {
    id,
    prefixCls = 'rc-tree-select',

    // Value
    value,
    defaultValue,
    onChange,
    onSelect,

    // Search
    searchValue,
    inputValue,
    onSearch,
    autoClearSearchValue = true,

    // Selector
    showCheckedStrategy = SHOW_CHILD,
    treeNodeLabelProp,

    //  Mode
    multiple,
    treeCheckable,
    treeCheckStrictly,
    labelInValue,

    // FieldNames
    fieldNames,

    // Data
    treeDataSimpleMode,
    treeData,
    children,
    loadData,
    treeLoadedKeys,
    onTreeLoad,

    // Options
    virtual,
    listHeight = 200,
    listItemHeight = 20,
  } = props;

  const mergedId = useId(id);
  const treeConduction = treeCheckable && !treeCheckStrictly;
  const mergedCheckable: boolean = !!(treeCheckable || treeCheckStrictly);
  const mergedLabelInValue = treeCheckStrictly || labelInValue;
  const mergedMultiple = mergedCheckable || multiple;

  // ========================= FieldNames =========================
  const mergedFieldNames: InternalFieldName = React.useMemo(
    () => fillFieldNames(fieldNames),
    /* eslint-disable react-hooks/exhaustive-deps */
    [JSON.stringify(fieldNames)],
    /* eslint-enable react-hooks/exhaustive-deps */
  );

  // =========================== Search ===========================
  const [mergedSearchValue, setSearchValue] = useMergedState('', {
    value: searchValue !== undefined ? searchValue : inputValue,
    postState: search => search || '',
  });

  const onInternalSearch: BaseSelectProps['onSearch'] = searchText => {
    setSearchValue(searchText);
    onSearch?.(searchText);
  };

  // ============================ Data ============================
  // `useTreeData` only do convert of `children` or `simpleMode`.
  // Else will return origin `treeData` for perf consideration.
  // Do not do anything to loop the data.
  const mergedTreeData = useTreeData(treeData, children, treeDataSimpleMode);

  const { keyEntities, valueEntities } = useDataEntities(mergedTreeData, mergedFieldNames);
  // console.log('KeyEntities', keyEntities);

  // =========================== Label ============================
  const getLabel = React.useCallback(
    (item: DefaultOptionType) => {
      if (item) {
        if (treeNodeLabelProp) {
          return item[treeNodeLabelProp];
        }

        // Loop from fieldNames
        const { _title: titleList } = mergedFieldNames;

        for (let i = 0; i < titleList.length; i += 1) {
          const title = item[titleList[i]];
          if (title !== undefined) {
            return title;
          }
        }
      }
    },
    [mergedFieldNames, treeNodeLabelProp],
  );

  // ========================= Wrap Value =========================
  const convert2LabelValues = React.useCallback(
    (draftValues: ValueType) => {
      const values = toArray(draftValues);

      return values.map(val => {
        let rawLabel: React.ReactNode;
        let rawValue: RawValueType;
        let rawHalfChecked: boolean;

        // Init provided info
        if (!isRawValue(val)) {
          rawLabel = val.label;
          rawValue = val.value;
          rawHalfChecked = val.halfChecked;
        } else {
          rawValue = val;
        }

        // Fill missing label
        if (rawLabel === undefined) {
          const entity = valueEntities.get(rawValue);
          rawLabel = getLabel(entity?.node);
        }

        return {
          label: rawLabel,
          value: rawValue,
          halfChecked: rawHalfChecked,
        };
      });
    },
    [valueEntities, getLabel],
  );

  // =========================== Values ===========================
  const [internalValue, setInternalValue] = useMergedState(defaultValue, { value });

  const rawMixedLabeledValues = React.useMemo(
    () => convert2LabelValues(internalValue),
    [convert2LabelValues, internalValue],
  );

  // Split value into full check and half check
  const [rawLabeledValues, rawHalfCheckedValues] = React.useMemo(() => {
    const fullCheckValues: LabeledValueType[] = [];
    const halfCheckValues: LabeledValueType[] = [];

    rawMixedLabeledValues.forEach(item => {
      if (item.halfChecked) {
        halfCheckValues.push(item);
      } else {
        fullCheckValues.push(item);
      }
    });

    return [fullCheckValues, halfCheckValues];
  }, [rawMixedLabeledValues]);

  const [mergedValues] = useCache(rawLabeledValues);
  const rawValues = React.useMemo(() => mergedValues.map(item => item.value), [mergedValues]);

  const displayValues = React.useMemo(
    () =>
      mergedValues.map(item => ({
        ...item,
        label: item.label ?? item.value,
      })),
    [mergedValues],
  );

  /** Get `missingRawValues` which not exist in the tree yet */
  const splitRawValues = React.useCallback(
    (newRawValues: RawValueType[]) => {
      const missingRawValues = [];
      const existRawValues = [];

      // Keep missing value in the cache
      newRawValues.forEach(val => {
        if (valueEntities.has(val)) {
          existRawValues.push(val);
        } else {
          missingRawValues.push(val);
        }
      });

      return { missingRawValues, existRawValues };
    },
    [valueEntities],
  );

  // =========================== Change ===========================
  const triggerChange = useRefFunc(
    (
      newRawValues: RawValueType[],
      extra: { triggerValue: RawValueType; selected: boolean },
      source: SelectSource,
    ) => {
      const labeledValues = convert2LabelValues(newRawValues);
      setInternalValue(labeledValues);

      // Generate rest parameters is costly, so only do it when necessary
      if (onChange) {
        let eventValues: RawValueType[] = newRawValues;
        if (treeConduction && showCheckedStrategy !== 'SHOW_ALL') {
          const keyList = newRawValues.map(val => {
            const entity = valueEntities.get(val);
            return entity?.key ?? val;
          });
          const formattedKeyList = formatStrategyKeys(keyList, showCheckedStrategy, keyEntities);
          eventValues = formattedKeyList.map(key => {
            const entity = valueEntities.get(key);
            return entity ? entity.node[mergedFieldNames.value] : key;
          });
        }

        const { triggerValue, selected } = extra || {
          triggerValue: undefined,
          selected: undefined,
        };

        let returnLabeledValues: LabeledValueType[] = convert2LabelValues(eventValues);

        // We need fill half check back
        if (treeCheckStrictly) {
          const halfValues = rawHalfCheckedValues.filter(item => !eventValues.includes(item.value));

          returnLabeledValues = [...returnLabeledValues, ...halfValues];
        }

        const additionalInfo = {
          // [Legacy] Always return as array contains label & value
          preValue: rawLabeledValues,
          triggerValue,
        } as ChangeEventExtra;

        // [Legacy] Fill legacy data if user query.
        // This is expansive that we only fill when user query
        // https://github.com/react-component/tree-select/blob/fe33eb7c27830c9ac70cd1fdb1ebbe7bc679c16a/src/Select.jsx
        let showPosition = true;
        if (treeCheckStrictly || (source === 'selection' && !selected)) {
          showPosition = false;
        }

        fillAdditionalInfo(
          additionalInfo,
          triggerValue,
          newRawValues,
          mergedTreeData,
          showPosition,
          fieldNames,
        );

        if (mergedCheckable) {
          additionalInfo.checked = selected;
        } else {
          additionalInfo.selected = selected;
        }

        const returnValues = returnLabeledValues
          ? returnLabeledValues
          : returnLabeledValues.map(item => item.value);

        onChange(
          mergedMultiple ? returnValues : returnValues[0],
          mergedLabelInValue ? null : returnLabeledValues.map(item => item.label),
          additionalInfo,
        );
      }
    },
  );

  // ========================== Options ===========================
  /** Trigger by option list */
  const onOptionSelect: OnInternalSelect = React.useCallback(
    (selectedKey, info) => {
      const entity = keyEntities[selectedKey];

      // const eventValue = mergedLabelInValue ? selectValue : selectValue;
      // Never be falsy but keep it safe
      if (entity) {
        const selectedValue = entity.node[mergedFieldNames.value];

        if (!mergedMultiple) {
          // Single mode always set value
          triggerChange([selectedValue], { selected: true, triggerValue: selectedValue }, 'option');
        } else {
          let newRawValues = Array.from([...rawValues, selectedValue]);

          // Add keys if tree conduction
          if (treeConduction) {
            // Should keep missing values
            const { missingRawValues, existRawValues } = splitRawValues(newRawValues);
            const keyList = existRawValues.map(val => valueEntities.get(val).key);
            const { checkedKeys } = conductCheck(keyList, true, keyEntities);
            newRawValues = [
              ...missingRawValues,
              ...checkedKeys.map(key => keyEntities[key].node[mergedFieldNames.value]),
            ];
          }
          triggerChange(newRawValues, { selected: true, triggerValue: selectedValue }, 'option');
        }

        // Trigger select event
        onSelect?.(selectedValue, entity.node);
      }
    },
    [
      splitRawValues,
      valueEntities,
      keyEntities,
      mergedFieldNames,
      mergedMultiple,
      rawValues,
      triggerChange,
      treeConduction,
      onSelect,
    ],
  );

  // ========================== Context ===========================
  const treeSelectContext = React.useMemo<TreeSelectContextProps>(
    () => ({
      virtual,
      listHeight,
      listItemHeight,
      treeData: mergedTreeData,
      fieldNames: mergedFieldNames,
      onSelect: onOptionSelect,
    }),
    [virtual, listHeight, listItemHeight, mergedTreeData, mergedFieldNames, onOptionSelect],
  );

  // ======================= Legacy Context =======================
  const legacyContext = React.useMemo(
    () => ({
      checkable: mergedCheckable,
      loadData,
      treeLoadedKeys,
      onTreeLoad,
      checkedKeys: rawValues,
      // halfCheckedKeys: rawHalfCheckedKeys,
      // treeDefaultExpandAll,
      // treeExpandedKeys,
      // treeDefaultExpandedKeys,
      // onTreeExpand,
      // treeIcon,
      // treeMotion,
      // showTreeIcon,
      // switcherIcon,
      // treeLine,
      // treeNodeFilterProp,
      // getEntityByKey,
      // getEntityByValue,
    }),
    [
      mergedCheckable,
      loadData,
      treeLoadedKeys,
      onTreeLoad,
      rawValues,
      // rawHalfCheckedKeys,
      // treeDefaultExpandAll,
      // treeExpandedKeys,
      // treeDefaultExpandedKeys,
      // onTreeExpand,
      // treeIcon,
      // treeMotion,
      // showTreeIcon,
      // switcherIcon,
      // treeLine,
      // treeNodeFilterProp,
      // getEntityByKey,
      // getEntityByValue,
    ],
  );

  // =========================== Render ===========================
  return (
    <TreeSelectContext.Provider value={treeSelectContext}>
      <LegacyContext.Provider value={legacyContext}>
        <BaseSelect
          ref={ref}
          {...props}
          // >>> MISC
          id={mergedId}
          prefixCls={prefixCls}
          displayValues={displayValues}
          mode={mergedMultiple ? 'multiple' : undefined}
          // >>> Search
          searchValue={mergedSearchValue}
          onSearch={onInternalSearch}
          // >>> Options
          OptionList={OptionList}
        />
      </LegacyContext.Provider>
    </TreeSelectContext.Provider>
  );
}) as any; // TODO: handle this

// Assign name for Debug
if (process.env.NODE_ENV !== 'production') {
  TreeSelect.displayName = 'TreeSelect';
}

TreeSelect.TreeNode = TreeNode;
TreeSelect.SHOW_ALL = SHOW_ALL;
TreeSelect.SHOW_PARENT = SHOW_PARENT;
TreeSelect.SHOW_CHILD = SHOW_CHILD;

export default TreeSelect;
