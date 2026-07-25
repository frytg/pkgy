import init, { generate_github_chart } from '../pkg/githubchart.js'

export async function initWasm() {
	await init()
}

export async function generateGitHubChart(username, colorScheme) {
	return generate_github_chart(username, colorScheme)
}

export const COLOR_SCHEMES = {
	default: ['#eeeeee', '#c6e48b', '#7bc96f', '#239a3b', '#196127'],
	old: ['#eeeeee', '#d6e685', '#8cc665', '#44a340', '#1e6823'],
	halloween: ['#EEEEEE', '#FFEE4A', '#FFC501', '#FE9600', '#03001C'],
}
