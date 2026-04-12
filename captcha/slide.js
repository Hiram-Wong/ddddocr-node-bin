/**
 * 滑块验证码识别
 *
 * @see https://github.com/sml2h3/ddddocr/blob/master/ddddocr/core/slide_engine.py
 */

const cv = require("@techstark/opencv-js");
const { Jimp } = require("jimp");

class SlideCaptchaService {
  static instance = null;

  constructor() {}

  static getInstance() {
    if (!SlideCaptchaService.instance) {
      SlideCaptchaService.instance = new SlideCaptchaService();
    }
    return SlideCaptchaService.instance;
  }

  async base64ToMat(base64) {
    const image = await Jimp.read(
      Buffer.from(base64.replace(/^data:image\/\w+;base64,/, ""), "base64"),
    );

    const { width, height, data } = image.bitmap;

    const matRGBA = new cv.Mat(height, width, cv.CV_8UC4);
    matRGBA.data.set(data);

    const matRGB = new cv.Mat();
    cv.cvtColor(matRGBA, matRGB, cv.COLOR_RGBA2RGB);

    matRGBA.delete();

    return matRGB;
  }

  toGray(mat) {
    const gray = new cv.Mat();
    cv.cvtColor(mat, gray, cv.COLOR_RGB2GRAY);
    return gray;
  }

  _simpleTemplateMatch(target_gray, background_gray) {
    const result = new cv.Mat();
    cv.matchTemplate(background_gray, target_gray, result, cv.TM_CCOEFF_NORMED);

    const { maxLoc, maxVal } = cv.minMaxLoc(result);

    const x1 = maxLoc.x;
    const y1 = maxLoc.y;
    const x2 = x1 + target_gray.cols;
    const y2 = y1 + target_gray.rows;

    result.delete();

    return {
      x: x1,
      y: y1,
    };
  }

  _edgeBasedMatch(target_gray, background_gray) {
    // 高斯模糊
    const blurTarget = new cv.Mat();
    const blurBg = new cv.Mat();

    // cv.GaussianBlur(target_gray, blurTarget, new cv.Size(3, 3), 0);
    // cv.GaussianBlur(background_gray, blurBg, new cv.Size(3, 3), 0);
    cv.GaussianBlur(target_gray, blurTarget, new cv.Size(5, 5), 1.2);
    cv.GaussianBlur(background_gray, blurBg, new cv.Size(5, 5), 1.2);

    // Canny 边缘
    const edgeTarget = new cv.Mat();
    const edgeBg = new cv.Mat();

    // cv.Canny(blurTarget, edgeTarget, 100, 200);
    // cv.Canny(blurBg, edgeBg, 100, 200);
    cv.Canny(blurTarget, edgeTarget, 50, 150);
    cv.Canny(blurBg, edgeBg, 50, 150);

    // 形态学增强
    // const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
    // cv.dilate(edgeTarget, edgeTarget, kernel);
    // cv.dilate(edgeBg, edgeBg, kernel);
    const kernel = cv.getStructuringElement(
      cv.MORPH_ELLIPSE,
      new cv.Size(5, 5),
    );
    cv.dilate(edgeTarget, edgeTarget, kernel, new cv.Point(-1, -1), 2);
    cv.dilate(edgeBg, edgeBg, kernel, new cv.Point(-1, -1), 2);

    const result = new cv.Mat();
    cv.matchTemplate(edgeBg, edgeTarget, result, cv.TM_CCOEFF_NORMED);

    const { maxLoc, maxVal } = cv.minMaxLoc(result);

    const x1 = maxLoc.x;
    const y1 = maxLoc.y;
    const x2 = x1 + edgeTarget.cols;
    const y2 = y1 + edgeTarget.rows;

    [blurTarget, blurBg, edgeTarget, edgeBg, result, kernel].forEach((m) =>
      m.delete(),
    );

    return {
      x: x1,
      y: y1,
    };
  }

  async simpleMatch(thumbBase64, bgBase64, simple = false) {
    const thumb = await this.base64ToMat(thumbBase64);
    const bg = await this.base64ToMat(bgBase64);

    if (!thumb || !bg) {
      if (thumb) thumb.delete();
      if (bg) bg.delete();

      throw new Error("图像加载失败");
    }
    console.debug(
      `[SLIDE] 输入图像尺寸: thumb-${thumb.cols}x${thumb.rows}, bg-${bg.cols}x${bg.rows}`,
    );

    const grayThumb = this.toGray(thumb);
    const grayBg = this.toGray(bg);

    let result = {};

    try {
      if (simple) {
        result = this._simpleTemplateMatch(grayThumb, grayBg);
      } else {
        result = this._edgeBasedMatch(grayThumb, grayBg);
      }
    } finally {
      [thumb, bg, grayThumb, grayBg].forEach((m) => m?.delete?.());
    }

    return result;
  }

  async simpleComparison(thumbBase64, bgBase64) {
    const thumb = await this.base64ToMat(thumbBase64);
    const bg = await this.base64ToMat(bgBase64);

    // console.debug(
    //   `[SLIDE] 输入图像尺寸: thumb-${thumb.cols}x${thumb.rows}, bg-${bg.cols}x${bg.rows}`,
    // );

    const grayThumb = this.toGray(thumb);
    const grayBg = this.toGray(bg);

    // 差异
    const diff = new cv.Mat();
    cv.absdiff(grayThumb, grayBg, diff);

    // 二值化
    const thresh = new cv.Mat();
    cv.threshold(diff, thresh, 50, 255, cv.THRESH_BINARY);

    // 形态学（增强轮廓）
    const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
    const morph = new cv.Mat();
    cv.morphologyEx(thresh, morph, cv.MORPH_CLOSE, kernel);

    // 找轮廓
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();

    cv.findContours(
      morph,
      contours,
      hierarchy,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE,
    );

    let maxArea = 0;
    let best = { x: 0, y: 0 };

    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const rect = cv.boundingRect(cnt);

      const area = rect.width * rect.height;

      if (area > maxArea) {
        maxArea = area;
        best = rect;
      }

      cnt.delete();
    }

    [
      thumb,
      bg,
      grayThumb,
      grayBg,
      diff,
      thresh,
      morph,
      contours,
      hierarchy,
    ].forEach((m) => m?.delete?.());

    return {
      x: best.x,
      y: best.y,
    };
  }
}

const slideCaptchaService = SlideCaptchaService.getInstance();

module.exports = {
  slideCaptchaService,
};
