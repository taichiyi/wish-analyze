const axios = require('axios');
const request = require('request');
const qs = require('qs');
const fs = require('fs');
const prettyFormat = require('pretty-format');
const nodemailer = require('nodemailer');

/**
 * TODO
 * - 分析出店铺设置的商品金额
 * - 分析出店铺设置的运费
 * - 分析出上架时间
 */

// ====== config -start- ======
const DEBUG = false;
let data_number = 50;
const toy_data_number = 20;
const normal_data_number = 50;
const interval_time = 200; // 毫秒
let continue_max_time = 1000 * 60 * 5; // 单词循环最大持续时间(毫秒)
const toy_continue_max_time = 1000 * 60 * 8; // 单词循环最大持续时间(毫秒)
const normal_continue_max_time = 1000 * 60 * 5; // 单词循环最大持续时间(毫秒)
const big_interval_time = 1000 * 60 * 60 * 3; // 大循环(毫秒)
const currently_viewing_threshold_region = [0.1, 30]; // currently_viewing 阀值区间
const X_XSRFToken = '2|bc86e05e|3db7de46c41e63d9c436189caab2e7bc|1534822497';
const Cookie = '_xsrf=2|bc86e05e|3db7de46c41e63d9c436189caab2e7bc|1534822497; bsid=bb61a7ee14aa438994cb49c5ca006944; __utma=96128154.1983183851.1534822500.1534822500.1534822500.1; __utmc=96128154; __utmz=96128154.1534822500.1.1.utmcsr=(direct)|utmccn=(direct)|utmcmd=(none); __utmt=1; __utmb=96128154.1.10.1534822500; cto_lwid=e3b83d40-48e0-4d90-8789-75c3d6567fc1; _timezone=-8; sweeper_uuid=31b9f7ec5d3b4495aa7fbba9f88431b4; sweeper_session="2|1:0|10:1534822510|15:sweeper_session|84:NWQ0MGQ0NjEtMWQyOC00NDYyLTk1NzktOGRjZTcwOGQzMDgxMjAxOC0wOC0yMSAwMzozNTowNS4xMTg4MzI=|f93c80be72a5798370bfd60821391915048dde163950da54f7e2aab89203602a"; sessionRefreshed_59ad16a47eae6e0907ff342a=true; G_ENABLED_IDPS=google';
let keys = {
  pass: '' // 需要自己配置
};

try {
  keys = require('./keys.json');
} catch (error) {
  console.log(error);
}
// ====== config -end- ======

const base_url = 'https://www.wish.com';

// === 单次大循环中所用来存储数据的变量 -start-  ===
let data_result = []; // 结果集
let start_time_str = 0; // 开始时间
let end_time_str = 0; // 结束时间
let total_product_number = 0; // 商品总数
// === 单次大循环中所用来存储数据的变量 -end-  ===

const write_file = (path, data, callback) => {
  callback = callback || (() => {});
  fs.open(path, 'w+', (err, fd) => {
    if (err) return DEBUG && console.log('打开文件失败');

    fs.write(fd, data, 0, 'utf8', (err, written, string) => {
      if (err) return DEBUG && console.log('写入失败');

      DEBUG && console.log('创建成功');
      callback();
      fs.close(fd, () => {});
    });
  });
};

/**
 * 发送邮件
 * @param {string} subject 主题
 * @param {string} text 邮件文本
 */
const sendEmail = (subject = '', text = '') => {
  let transporter = nodemailer.createTransport({
    host: 'smtp.qq.com',
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: 'taichiyi@foxmail.com', // generated ethereal user
      pass: keys.pass // generated ethereal password
    }
  });

  const toEmail = DEBUG ? 'yiyu2100@foxmail.com' : 'yiyu2100@foxmail.com, 651191323@qq.com';
  DEBUG && console.log(toEmail);

  // setup email data with unicode symbols
  let mailOptions = {
    from: '"老六" <taichiyi@foxmail.com>', // sender address
    to: toEmail, // list of receivers
    // to: 'windows67214@qq.com,taichiyi@aliyun.com', // list of receivers
    subject: subject, // Subject line
    text: text // plain text body
    // html: text // html body
  };

  // send mail with defined transport object
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      return DEBUG && console.log(error);
    }
    DEBUG && console.log('Message sent: %s', info.messageId);
    DEBUG && console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
  });
};

const for_list = (array, callback) => {
  const requested_length = array.length;
  let response_length = 0;
  let result = [];

  const all_loaded = () => {
    response_length += 1;
    DEBUG && console.log(`response_num: ${response_length}/${requested_length}`);
    return requested_length === response_length && callback(result);
  };

  for (let index = 0; index < array.length; index++) {
    setTimeout(() => {
      const element = array[index];
      product__get({}, { cid: element.id }, ret => {
        all_loaded();
        result.push(ret);
      });
    }, interval_time * index);
  }
};

const feed__get_filtered_feed = (headers_options = {}, form_options = {}) => {
  data_number = IsToyTime() ? toy_data_number : normal_data_number;
  if (form_options.offset === undefined) {
    // 初始化
    data_result = []; // 结果集
    start_time_str = +new Date(); // 开始时间
    end_time_str = 0; // 结束时间
    total_product_number = 0; // 商品总数
  }

  const headers = Object.assign(
    {
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
      'X-XSRFToken': X_XSRFToken,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/67.0.3377.1 Safari/537.36',
      'Accept-Language': 'en-US;q=0.8,en;q=0.7,vi;q=0.6',
      Cookie: Cookie
    },
    headers_options
  );

  const form = Object.assign(
    {
      count: 20,
      offset: 20,
      request_id: 'tabbed_feed_latest',
      request_categories: false,
      request_branded_filter: false,
      _buckets: '',
      _experiments: ''
    },
    form_options
  );

  DEBUG && console.log(form);
  total_product_number = form.offset;

  request.post(
    {
      url: `${base_url}/api/feed/get-filtered-feed`,
      headers: headers,
      form: form
    },
    function(err, httpResponse, body) {
      if (err) return false;
      try {
        body = JSON.parse(body);
      } catch (error) {
        setTimeout(() => {
          feed__get_filtered_feed();
        }, normal_continue_max_time);
      }
      if (body.code !== 0) {
        DEBUG && console.log(body);
        switch (body.code) {
          case 2:
            DEBUG === false && sendEmail('wish错误', body.msg);
            break;
        
          default:
            break;
        }
        return false;
      }

      const sweeper_uuid = body.sweeper_uuid;
      const data = body.data;
      const next_offset = data.next_offset; // 数据库，当前指针位置
      const products = data.products; // 商品列表
      const initial_category_id = data.initial_category_id;
      const no_more_items = data.no_more_items; // 是否还有更多商品

      const get_format_date = str => {
        const newDate = new Date(str);
        let year = newDate.getFullYear();
        let month = newDate.getMonth() + 1;
        let date = newDate.getDate();
        let hour = newDate.getHours();
        let minute = newDate.getMinutes();
        let second = newDate.getSeconds();

        month < 10 && (month = '0' + month);
        date < 10 && (date = '0' + date);
        hour < 10 && (hour = '0' + hour);
        minute < 10 && (minute = '0' + minute);
        second < 10 && (second = '0' + second);

        return `${year}-${month}-${date} ${hour}:${minute}:${second}`;
      };

      const make_result_info = () => {
        const valid_total_rate = (data_result.length * 100 / total_product_number).toFixed(2);

        const used_time = (start_time_str, end_time_str) => {
          const differenceTimeStr = parseInt((end_time_str - start_time_str) * 0.001);
          const differenceMinute = parseInt(differenceTimeStr / 60);
          const differenceSecond = differenceTimeStr % 60;
          return `${differenceMinute}分${differenceSecond}秒`;
        };

        return `耗时：${used_time(start_time_str, end_time_str)}；商品数量：${data_result.length}\r\n`;

        // return `
        //   开始时间：${get_format_date(start_time_str)}
        //   结束时间：${get_format_date(end_time_str)}
        //   有效商品/商品总数：${data_result.length}/${total_product_number} (${valid_total_rate}%)
        //   `;
      };

      DEBUG && console.log(data.no_more_items);
      DEBUG && console.log(data_result.length);
      const continue_time = +new Date() - start_time_str;
      DEBUG && console.log(continue_time);
      continue_max_time = IsToyTime() ? toy_continue_max_time : normal_continue_max_time;
      DEBUG && console.log(continue_max_time);
      if (data_result.length > data_number || continue_time > continue_max_time) {
        const filter_repeat_data_result = filter_repeat_data(data_result);
        data_result = filter_sort_data(filter_repeat_data_result);

        end_time_str = +new Date();

        sendEmail(`wish报告${get_format_date(start_time_str)}`, make_result_info() + prettyFormat(data_result));

        write_file('./wish_response.txt', make_result_info() + prettyFormat(data_result));

        setTimeout(() => {
          feed__get_filtered_feed();
        }, big_interval_time);

        return false;
      }

      data.no_more_items === false &&
        for_list(products, ret => {
          feed__get_filtered_feed({}, { offset: next_offset });
          const filter_invalid_data_result = filter_invalid_data(ret);
          // const filter_sort_data_result = filter_sort_data(filter_invalid_data_result);
          data_result = [...data_result, ...filter_invalid_data_result];

          // write_file('./wish_response.txt', JSON.stringify(filter_sort_data_result));
        });
    }
  );
};

const product__get = (headers_options = {}, form_options = {}, callback = () => {}) => {
  const headers = Object.assign(
    {
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
      'X-XSRFToken': X_XSRFToken,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/67.0.3377.1 Safari/537.36',
      'Accept-Language': 'en-US;q=0.8,en;q=0.7,vi;q=0.6',
      Cookie: Cookie
    },
    headers_options
  );

  // 5ac19407d749a54e5d646230(多个产品)
  // 591973048b846f7e4e8a938e(一个产品)
  const form = Object.assign(
    {
      cid: '591973048b846f7e4e8a938e',
      related_contest_count: 9,
      include_related_creator: false,
      request_sizing_chart_info: true,
      _buckets: '',
      _experiments: ''
    },
    form_options
  );

  request.post(
    {
      url: `${base_url}/api/product/get`,
      headers: headers,
      form: form,
      timeout: 5000
    },
    function(err, httpResponse, body) {
      if (err) return callback();
      try {
        body = JSON.parse(body);
      } catch (error) {
        return feed__get_filtered_feed();
      }
      if (body.code !== 0) return callback();
      const contest = body.data.contest;
      if (contest.currently_viewing && contest.currently_viewing.message) {
        const reg = /([^]+?) viewing now/;
        const str = contest.currently_viewing.message;
        const result = str.match(reg);
        let app_indexing_data = body.data.app_indexing_data;

        // 在toy时间里 && 不含有toy
        if (IsToyTime() && !/toy/i.test(contest.keywords)) {
          return callback();
        }

        if (IsToyTime() && /sex/i.test(contest.keywords)) {
          return callback();
        }

        if (!result || result.length === 0) {
          return callback();
        } else {
          app_indexing_data.num_bought = contest.num_bought;
          app_indexing_data.num_wishes = contest.num_wishes;
          app_indexing_data.keywords = contest.keywords;
          app_indexing_data.currently_viewing = parseInt(result[1]);
          delete app_indexing_data.app_uri;
          return currently_viewing_threshold_region[0] <= app_indexing_data.currently_viewing && app_indexing_data.currently_viewing <= currently_viewing_threshold_region[1] ? callback(app_indexing_data) : callback();
        }
      } else {
        return callback();
      }

      callback(contest);
    }
  );
};

const filter_invalid_data = function(array) {
  let result = [];
  for (let index = 0; index < array.length; index++) {
    const element = array[index];
    if (element) result.push(element);
  }
  return result;
};

/**
 *
 * @param {array} main_data 被插入的主要数据
 * @param {object} insert_data 待插入的数据
 * @param {string/number} compare_key 被比较的键
 * @param {number} compare_value 插入数据的比较值
 */
const compare_insert_array = (main_data, insert_data, compare_key, compare_value) => {
  for (let index = 0; index < main_data.length; index++) {
    const main_data_item = main_data[index];

    if (+compare_value > +main_data_item[compare_key]) {
      main_data.splice(index, 0, insert_data);
      break;
    }
    if (index === main_data.length - 1) {
      main_data.splice(index + 1, 0, insert_data);
      break;
    }
  }
};

// 排序
const filter_sort_data = function(array) {
  let result = [];
  for (let index = 0; index < array.length; index++) {
    const element = array[index];
    if (result.length) {
      compare_insert_array(result, element, 'currently_viewing', element.currently_viewing);
    } else {
      result.push(element);
    }
  }
  return result;
};

const filter_repeat_data = array => {
  let result = [];

  const is_exist = (item, array) => {
    let result = false;
    for (let index = 0; index < array.length; index++) {
      const element = array[index];
      if (item.web_url === element.web_url) {
        result = true;
        break;
      }
    }
    return result;
  };

  for (let index = 0; index < array.length; index++) {
    const element = array[index];
    if (is_exist(element, result) === false) result.push(element);
  }
  return result;
};

const IsToyTime = () => {
  const newDate = new Date();
  const year = newDate.getFullYear();
  const month = newDate.getMonth() + 1;
  const date = newDate.getDate();

  const timeStart = `${year}-${month}-${date} 10:00:00`;
  const timeEnd = `${year}-${month}-${date} 18:00:00`;

  const timeNowStr = +new Date();
  const timeStartStr = Date.parse(timeStart);
  const timeEndStr = Date.parse(timeEnd);

  return false;
  // return timeStartStr <= timeNowStr && timeNowStr <= timeEndStr;
};

feed__get_filtered_feed();
// product__get();
