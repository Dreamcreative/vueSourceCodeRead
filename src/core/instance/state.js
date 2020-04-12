/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import Dep, { pushTarget, popTarget } from '../observer/dep'
import { isUpdatingChildComponent } from './lifecycle'

import {
  set,
  del,
  observe,
  defineReactive,
  toggleObserving
} from '../observer/index'

import {
  warn,
  bind, // 如果当前运行环境支持Function.prototype.bind方法，则直接调用；如果不支持，则使用vue自己编写的bind方法
  noop, // 函数，返回一个undefined
  hasOwn, // 判断是否是自身属性，调用的是Object.prototpye.hasOwnProperty
  hyphenate, // 将 类似abcAbc 转换成 abc-abc这种格式的字符串，就是将字符串的大写字母转为小写，并使用'-'进行连接
  isReserved, // 判断是否是以_ 或者是 $. 开头，因为vue自身属性是以_或者$. 开头的
  handleError,
  nativeWatch,
  validateProp,
  isPlainObject, // 如果是对象
  isServerRendering, // 判断是否是服务器渲染
  isReservedAttribute // 判断是否是vue的保留属性
} from '../util/index'

const sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: noop,
  set: noop
}

export function proxy (target: Object, sourceKey: string, key: string) {
  sharedPropertyDefinition.get = function proxyGetter () {
    return this[sourceKey][key]
  }
  sharedPropertyDefinition.set = function proxySetter (val) {
    this[sourceKey][key] = val
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}
// 初始化状态
/**
 * 如果实例具有props、methods、data、computed、watch这些属性时，分别进行初始化操作
 */
export function initState (vm: Component) {
  vm._watchers = []
  const opts = vm.$options
  if (opts.props) initProps(vm, opts.props)
  if (opts.methods) initMethods(vm, opts.methods)
  if (opts.data) {
    initData(vm)
  } else {
    observe(vm._data = {}, true /* asRootData */)
  }
  if (opts.computed) initComputed(vm, opts.computed)
  if (opts.watch && opts.watch !== nativeWatch) {
    initWatch(vm, opts.watch)
  }
}

// 初始化props 传入的属性值 vm:vue实例、propsOptions:挂载在vm上的props对象
function initProps (vm: Component, propsOptions: Object) {
  const propsData = vm.$options.propsData || {}
  const props = vm._props = {}
  // cache prop keys so that future props updates can iterate using Array
  // instead of dynamic object key enumeration.
  /**
   * 对prop的值进行缓存，以便于在将来的属性更新时能够使用数组进行遍历
   * 来代替动态的对象查找
   */
  const keys = vm.$options._propKeys = []
  const isRoot = !vm.$parent
  // root instance props should be converted
  if (!isRoot) {
    toggleObserving(false)
  }
  /**
   * 遍历传入的vm实例上的 props属性
   *    1. 将key值进行缓存
   *    2. 对prop属性进行验证
   *    3. 对prop属性进行双向数据绑定 
   */
  for (const key in propsOptions) {
    keys.push(key)
    const value = validateProp(key, propsOptions, propsData, vm)
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      const hyphenatedKey = hyphenate(key)
      if (sReservedAttributei(hyphenatedKey) ||
          config.isReservedAttr(hyphenatedKey)) {
        warn(
          `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
          vm
        )
      }
      defineReactive(props, key, value, () => {
        if (!isRoot && !isUpdatingChildComponent) {
          warn(
            `Avoid mutating a prop directly since the value will be ` +
            `overwritten whenever the parent component re-renders. ` +
            `Instead, use a data or computed property based on the prop's ` +
            `value. Prop being mutated: "${key}"`,
            vm
          )
        }
      })
    } else {
      defineReactive(props, key, value)
    }
    // static props are already proxied on the component's prototype
    // during Vue.extend(). We only need to proxy props defined at
    // instantiation here.
    if (!(key in vm)) {
      proxy(vm, `_props`, key)
    }
  }
  // 开启观察者模式
  toggleObserving(true)
}
// 初始化data属性
/**
 * 1. 判断data的类型
 *    如果为data为函数，则获取函数中的返回值
 *    如果data不为函数，则直接取值，或者设置为空对象
 * 2. 如果data不为对象，则报错
 * 3. 通过while循环，分别查找props、methods属性中是否具有与data对象中同名的属性
 *    如果有同名属性，则报错 props、methods中已经定义了data对象的属性
 * 4. 对data对象进行观察者监听
 */
function initData (vm: Component) {
  let data = vm.$options.data
  data = vm._data = typeof data === 'function'
    ? getData(data, vm)
    : data || {}
  if (!isPlainObject(data)) {
    data = {}
    process.env.NODE_ENV !== 'production' && warn(
      'data functions should return an object:\n' +
      'https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function',
      vm
    )
  }
  // proxy data on instance
  const keys = Object.keys(data)
  const props = vm.$options.props
  const methods = vm.$options.methods
  let i = keys.length
  while (i--) {
    const key = keys[i]
    if (process.env.NODE_ENV !== 'production') {
      if (methods && hasOwn(methods, key)) {
        warn(
          `Method "${key}" has already been defined as a data property.`,
          vm
        )
      }
    }
    if (props && hasOwn(props, key)) {
      process.env.NODE_ENV !== 'production' && warn(
        `The data property "${key}" is already declared as a prop. ` +
        `Use prop default value instead.`,
        vm
      )
    } else if (!isReserved(key)) {
      proxy(vm, `_data`, key)
    }
  }
  // observe data
  observe(data, true /* asRootData */)
}

export function getData (data: Function, vm: Component): any {
  // #7573 disable dep collection when invoking data getters
  pushTarget()
  try {
    return data.call(vm, vm)
  } catch (e) {
    handleError(e, vm, `data()`)
    return {}
  } finally {
    popTarget()
  }
}

const computedWatcherOptions = { lazy: true }
// 初始化computed属性
/**
 * 遍历computed属性
 *  1. 判断每个值是否是函数，如果是函数，则直接赋值
 *  如果不是函数，则获取当前computed属性值的 get属性
 *  如果当前属性的 get属性不存在，则报错
 * 2. 如果当前computed 属性还没有挂载到vm实例上，则进行defineComputed()
 *  如果当前computed属性已经挂载到vm实例上，则在实例上的$data、$options.props属性上进行查找
 *  如果存在在 $data或者$options.props上，则报错 computed属性已经被定义
 */
function initComputed (vm: Component, computed: Object) {
  // $flow-disable-line
  const watchers = vm._computedWatchers = Object.create(null)
  // computed properties are just getters during SSR
  const isSSR = isServerRendering()

  for (const key in computed) {
    const userDef = computed[key]
    const getter = typeof userDef === 'function' ? userDef : userDef.get
    if (process.env.NODE_ENV !== 'production' && getter == null) {
      warn(
        `Getter is missing for computed property "${key}".`,
        vm
      )
    }

    if (!isSSR) {
      // create internal watcher for the computed property.
      watchers[key] = new Watcher(
        vm,
        getter || noop,
        noop,
        computedWatcherOptions
      )
    }

    // component-defined computed properties are already defined on the
    // component prototype. We only need to define computed properties defined
    // at instantiation here.
    // computed属性已经在组件原型上定义了，我们只需要在定义属性这里实例化
    /**
     * 如果当前属性没有在vue实例上，则直接定义computed属性
     * 否则在组件的data跟props查找当前key是定义在哪个属性上，然后报错
     */
    if (!(key in vm)) {
      defineComputed(vm, key, userDef)
    } else if (process.env.NODE_ENV !== 'production') {
      if (key in vm.$data) {
        warn(`The computed property "${key}" is already defined in data.`, vm)
      } else if (vm.$options.props && key in vm.$options.props) {
        warn(`The computed property "${key}" is already defined as a prop.`, vm)
      }
    }
  }
}

/**
 * 如果传入的 computed[key] 是函数
 *  设置 对象属性的访问器属性 的 getter
 *    如果不是服务器渲染，则调用createComputedGetter()
 *    如果是服务器渲染，则调用createGetterInvoker()
 *  设置对象属性的访问器属性的 setter为 undefined
 * 
 * 如果传入的computed[key]是对象
 * 设置对象属性的访问器属性的getter
 *  如果对象存在get属性 
 *    如果不是服务器渲染并且computed[key]的cache是false，则调用createComputedGetter()
 *    否则调用createGetterInvoker()
 *  如果对象不存在get属性，则设置为undefined
 * 设置对象的访问器属性的setter为 computed[key]的set属性，如果没有set属性，则设置为undefined
 * 
 * 最后再判断，如果在开发模式下，并且对象的访问器属性的setter为undefined
 *  那么computed在调用getter时会报错，没有定义访问器属性的setter
 * 
 * 最后调用Object.defineProperty(目标对象, key, 设置的属性访问器属性)
 */
export function defineComputed (
  target: any,
  key: string,
  userDef: Object | Function
) {
  // 不是服务器渲染
  const shouldCache = !isServerRendering()
  if (typeof userDef === 'function') {
    sharedPropertyDefinition.get = shouldCache
      ? createComputedGetter(key)
      : createGetterInvoker(userDef) // 创建getter调用程序
    sharedPropertyDefinition.set = noop
  } else {
    sharedPropertyDefinition.get = userDef.get
      ? shouldCache && userDef.cache !== false
        ? createComputedGetter(key)
        : createGetterInvoker(userDef.get)
      : noop
    sharedPropertyDefinition.set = userDef.set || noop
  }
  if (process.env.NODE_ENV !== 'production' &&
      sharedPropertyDefinition.set === noop) {
    sharedPropertyDefinition.set = function () {
      warn(
        `Computed property "${key}" was assigned to but it has no setter.`,
        this
      )
    }
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

// 创建计算属性的getter方法
function createComputedGetter (key) {
  return function computedGetter () {
    const watcher = this._computedWatchers && this._computedWatchers[key]
    if (watcher) {
      if (watcher.dirty) {
        watcher.evaluate()
      }
      if (Dep.target) {
        watcher.depend()
      }
      return watcher.value
    }
  }
}

// 创建getter方法的调用器，只是简单的将传入的 computed[key]函数，或者是computed[key].get方法进行调用
function createGetterInvoker(fn) {
  return function computedGetter () {
    return fn.call(this, this)
  }
}
// 初始化methods
/**
 * 遍历methods
 *  如果methods的属性不是function则报错
 *  如果methods的属性已经被props对象定义了，则报错
 *  如果methods的属性，存在于vue实例上，并且当前methods属性为保留名词，则报错
 * 最后，如果methods[key]不是function,则将key挂载到vue实例上的值为undefined,
 *  如果methods[key]是function,则在vue实例上挂载的值是一个已经进行了this绑定的新函数,并将vue的实例当做参数传入
 */
function initMethods (vm: Component, methods: Object) {
  const props = vm.$options.props
  for (const key in methods) {
    if (process.env.NODE_ENV !== 'production') {
      if (typeof methods[key] !== 'function') {
        warn(
          `Method "${key}" has type "${typeof methods[key]}" in the component definition. ` +
          `Did you reference the function correctly?`,
          vm
        )
      }
      if (props && hasOwn(props, key)) {
        warn(
          `Method "${key}" has already been defined as a prop.`,
          vm
        )
      }
      if ((key in vm) && isReserved(key)) {
        warn(
          `Method "${key}" conflicts with an existing Vue instance method. ` +
          `Avoid defining component methods that start with _ or $.`
        )
      }
    }
    vm[key] = typeof methods[key] !== 'function' ? noop : bind(methods[key], vm)
  }
}

// 初始化watch
/**
 * 循环watch属性
 *  如果 watch[key]是一个数组，则会循环调用createWatcher()
 *  如果watch[key]不是数组，则直接调用createWatcher()
 */
function initWatch (vm: Component, watch: Object) {
  for (const key in watch) {
    const handler = watch[key]
    if (Array.isArray(handler)) {
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i])
      }
    } else {
      createWatcher(vm, key, handler)
    }
  }
}

// 创建watcher
/**
 * 如果传入的是对象，将对象的watch[key].handler属性赋值给handler
 * 如果传入的是字符串，则直接将传入值当做 key值在vue实例上进行读取
 * 最后，进行监听
 */
function createWatcher (
  vm: Component,
  expOrFn: string | Function,
  handler: any,
  options?: Object
) {
  if (isPlainObject(handler)) {
    options = handler
    handler = handler.handler
  }
  if (typeof handler === 'string') {
    handler = vm[handler]
  }
  return vm.$watch(expOrFn, handler, options)
}

export function stateMixin (Vue: Class<Component>) {
  // flow somehow has problems with directly declared definition object
  // when using Object.defineProperty, so we have to procedurally build up
  // the object here.
  /**
   * flow 直接定义对象在某些情况下使用Object.defineProperty会有问题，所以我们需要在这里进行解决
   */
  const dataDef = {}
  dataDef.get = function () { return this._data }
  const propsDef = {}
  propsDef.get = function () { return this._props }
  if (process.env.NODE_ENV !== 'production') {
    dataDef.set = function () {
      warn(
        'Avoid replacing instance root $data. ' +
        'Use nested data properties instead.',
        this
      )
    }
    propsDef.set = function () {
      warn(`$props is readonly.`, this)
    }
  }
  Object.defineProperty(Vue.prototype, '$data', dataDef)
  Object.defineProperty(Vue.prototype, '$props', propsDef)

  Vue.prototype.$set = set
  Vue.prototype.$delete = del

  Vue.prototype.$watch = function (
    expOrFn: string | Function,
    cb: any,
    options?: Object
  ): Function {
    const vm: Component = this
    if (isPlainObject(cb)) {
      return createWatcher(vm, expOrFn, cb, options)
    }
    options = options || {}
    options.user = true
    const watcher = new Watcher(vm, expOrFn, cb, options)
    if (options.immediate) {
      try {
        cb.call(vm, watcher.value)
      } catch (error) {
        handleError(error, vm, `callback for immediate watcher "${watcher.expression}"`)
      }
    }
    return function unwatchFn () {
      watcher.teardown()
    }
  }
}
