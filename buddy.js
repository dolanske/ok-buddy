#!/usr/bin/env node

import chalk from "chalk"
import canvas from "canvas"
const { createCanvas, Image } = canvas

const args = process.argv
const subreddit = args[2]

if (!subreddit || subreddit.startsWith("-")) {
  logErr("Invalid or no subreddit name provided")
}

if (["help"].includes(subreddit)) {
  console.log(`

    ${chalk.green("usage:")}

      ./buddy.js <subreddit>

      parameters:

      ${chalk.blue("-hot")}            random post in hot category
      ${chalk.blue("-new")}            random post in new category
      ${chalk.blue("-top")} [options]  random post in top category
                      ${chalk.yellow("options:")} hour, day, week, month, year, all
                      ${chalk.yellow("default:")} hot
      ${chalk.blue("-simple")}         use simple character matching
      ${chalk.blue("-invert")}         inverts ascii character matching

  `)

  process.exit(1)
}

const adllowedFlagValues = ["hour", "day", "week", "month", "year", "all"]
const allowedFlagParams = ["-new", "-hot", "-top"]

const formatArguments = (data) => {
  let flagParam = null
  let flagValue = null
  let useSimple = false
  let invert = false

  // Iterate over each parameter and assign it
  data.map((parameter, index) => {
    if (allowedFlagParams.includes(parameter)) flagParam = parameter
    if (adllowedFlagValues.includes(parameter)) flagValue = parameter
    if (parameter === "-simple") useSimple = true
    if (parameter === "-invert") useSimple = true
  })

  return {
    flagParam,
    flagValue,
    useSimple,
    invert
  }
}

const { flagParam, flagValue, useSimple, invert } = formatArguments(args.slice(3))

const flag = (returnParam) => {
  const parameter = flagParam
  const value = flagValue

  const format = (category, time = null) => {
    if (returnParam === "category" || !returnParam) return category
    return time ? `?t=${time}` : ""
  }

  // Default to hot if incorrect or non allowed parameter is used
  if (!parameter || !allowedFlagParams.includes(parameter)) return format("hot")

  switch (parameter) {
    case "-new": {
      return format("new")
    }
    case "-top": {
      if (value && adllowedFlagValues.includes(value)) {
        return format("top", value)
      }

      return format("top", "day")
    }
    case "-hot": {
      return format("hot")
    }
  }
}

fetch(`https://www.reddit.com/r/${subreddit}/${flag("category")}/.json${flag("time")}`, {
  method: "GET"
})
  .then((response) => response.json())
  .then((response) => {
    // Some cleaning up in case something's missing or an error happened
    let res = response.data

    if (!res) throw "Couldn't load posts from " + subreddit

    const posts = res?.data?.children ?? null

    if (!res) throw "Couldn't load posts from " + subreddit

    const post = posts[ranMinMax(0, posts.length)]

    if (!post.data || post.data.length === 0 || post.data === {})
      throw "Missing required data from " + subreddit

    generatePost(post.data)
  })
  .catch((e) => logErr(e))

// A bit better formatting of errors
const logErr = (err) => {
  if (typeof err === "string") console.log(chalk.red(err))

  console.log(chalk.red(err.message))

  // Exit on error
  process.exit(1)
}

// Generate random number from the provided range
const ranMinMax = (min, max) => {
  min = Math.ceil(min)
  max = Math.floor(max)
  return Math.floor(Math.random() * (max - min + 1)) + min
}

const generatePost = async (data) => {
  let post = ""

  // Subreddit name
  post += chalk.bgBlue.black(`r/${subreddit}`) + " "
  // Post title
  post += chalk.blue(data.title) + "\n"

  // Convertor returns a promise which on resolve already has the ascii
  // which is inserted into the post and is then displayed
  convertImageToASCII(data)
    .then((ascii) => {
      post += ascii
      console.log(post)
    })
    .catch((e) => logErr(e))
}

const convertImageToASCII = async (data) => {
  return new Promise((resolve) => {
    // If post is a video, use its thumbnail
    let imageUrl = data.is_video ? data.thumbnail : data.url
    // Get terminal dimensions
    const width = process.stdout.columns
    const height = process.stdout.rows

    // Node by default doesn't support creating HTML elements. Need to use the canvas library
    const cnv = createCanvas(width, height)
    const ctx = cnv.getContext("2d")

    // Same goes for image, imported from canvas
    const img = new Image()

    img.onload = () => {
      // Draw image to canvas in the size of terminal
      ctx.drawImage(img, 0, 0, width, height)

      // Take canvas context, scrape the image and convert it to a grayscale
      const grayScales = convertToGrayScales(ctx, width, height)

      // Iterate over image values and assign a character to each pixel
      const ascii = drawAscii(grayScales, width)

      // Return ascii output
      resolve(ascii)
    }

    img.src = imageUrl
  })
}

// Grayscale character, most visible at 0, least at the end
const map_simple = " .:-=+*#%@"
const map_large = " .'`^\",:;Il!i><~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$"
const map_simple_invert = "@%#*+=-:. "
const map_large_invert = "$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/|()1{}[]?-_+~<>i!lI;:,\"^`'. "

//const map_square = "     .◻▤▥▧▦▩■";
//const map_square_invert = "▩▦▧▤◻∙. ";

const chooseMap = () => {
  //return invert ? map_square : map_square_invert;

  if (invert) {
    return useSimple ? map_simple_invert : map_large_invert
  }

  return useSimple ? map_simple : map_large
}

const map = chooseMap()

// Assigns character based on the pixel's grayscale value (0,255)
const mapLookup = (imageData) => map[Math.ceil(((map.length - 1) * imageData) / 255)]

// Converts RGB input into grayscale
// https://en.wikipedia.org/wiki/Grayscale#Colorimetric_(perceptual_luminance-preserving)_conversion_to_grayscale
const toGrayScale = (r, g, b) => 0.21 * r + 0.72 * g + 0.07 * b

const convertToGrayScales = (context, width, height) => {
  // Get array of every pixel of our image
  const imageData = context.getImageData(0, 0, width, height)

  const grayScales = []

  // Iterate over each pixel - which is an array of R G B values
  for (let i = 0; i < imageData.data.length; i += 4) {
    const r = imageData.data[i]
    const g = imageData.data[i + 1]
    const b = imageData.data[i + 2]

    // Convert rgb values to grayscale using the predefined formula and save them
    const grayScale = toGrayScale(r, g, b)

    grayScales.push(grayScale)
  }

  return grayScales
}

const drawAscii = (grayScales, width) => {
  // Iterate over each pixel and assign grayscale value to the relevant character
  const ascii = grayScales.reduce((asciiContent, grayScale, index) => {
    let nextChars = mapLookup(grayScale)

    // Append new line if we reached terminal's width
    if ((index + 1) % width === 0) {
      nextChars += "\n"
    }

    return asciiContent + nextChars
  }, "")

  // Returns fully formatted ascii image
  return ascii
}
