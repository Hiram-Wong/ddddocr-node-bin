const cv = require("@techstark/opencv-js");
const { Jimp } = require("jimp");

class RotateCaptchaService {
  static instance = null;

  constructor() {}

  static getInstance() {
    if (!RotateCaptchaService.instance) {
      RotateCaptchaService.instance = new RotateCaptchaService();
    }
    return RotateCaptchaService.instance;
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

    if (mat.channels() === 4) {
      cv.cvtColor(mat, gray, cv.COLOR_BGRA2GRAY);
    } else {
      cv.cvtColor(mat, gray, cv.COLOR_BGR2GRAY);
    }

    return gray;
  }

  rotateMat(mat, angle) {
    const center = new cv.Point(mat.cols / 2, mat.rows / 2);
    const M = cv.getRotationMatrix2D(center, angle, 1);

    const dst = new cv.Mat();
    const size = new cv.Size(mat.cols, mat.rows);

    cv.warpAffine(mat, dst, M, size, cv.INTER_LINEAR, cv.BORDER_REPLICATE);

    M.delete();
    return dst;
  }

  matchScore = (bg, tpl) => {
    const result = new cv.Mat();
    cv.matchTemplate(bg, tpl, result, cv.TM_CCOEFF_NORMED);

    const minMax = cv.minMaxLoc(result);
    result.delete();

    return minMax.maxVal;
  };

  async main(thumbBase64, bgBase64) {
    const bg = await this.base64ToMat(bgBase64);
    const thumb = await this.base64ToMat(thumbBase64);

    if (!bg || !thumb) {
      if (bg) bg.delete();
      if (thumb) thumb.delete();

      throw new Error("图像加载失败");
    }

    // console.debug(
    //   `[ROTATE] 输入图像尺寸: thumb-${thumb.cols}x${thumb.rows}, bg-${bg.cols}x${bg.rows}`,
    // );

    const grayBg = this.toGray(bg);
    const grayThumb = this.toGray(thumb);

    const h = thumb.rows;
    const w = thumb.cols;

    const y1 = Math.floor((bg.rows - h) / 2);
    const x1 = Math.floor((bg.cols - w) / 2);

    const roi = grayBg.roi(new cv.Rect(x1, y1, w, h));

    let bestAngle = 0;
    let maxScore = -1;

    // 粗算
    for (let angle = 0; angle < 360; angle += 5) {
      const rotated = this.rotateMat(grayThumb, angle);
      const score = this.matchScore(roi, rotated);

      if (score > maxScore) {
        maxScore = score;
        bestAngle = angle;
      }

      rotated.delete();
    }

    // 精算
    for (let angle = bestAngle - 5; angle <= bestAngle + 5; angle++) {
      const rotated = this.rotateMat(grayThumb, angle);
      const score = this.matchScore(roi, rotated);

      if (score > maxScore) {
        maxScore = score;
        bestAngle = angle;
      }

      rotated.delete();
    }

    // 清理内存
    [bg, thumb, grayBg, grayThumb, roi].forEach((m) => m?.delete?.());

    return (bestAngle + 360) % 360;
  }
}

const rotateCaptchaService = RotateCaptchaService.getInstance();

module.exports = {
  rotateCaptchaService,
};
