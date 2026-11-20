package feed

// UpdatePriority applies the topic priority rules after one answer and returns
// the new priority plus the new consecutive-wrong counter.
//
// Wrong answer:
//
//	consecutiveWrong++
//	priority = min(100, priority + 15 + 10*consecutiveWrong)
//	if consecutiveWrong >= 2 -> priority = 100
//
// Correct answer:
//
//	if consecutiveWrong > 0 -> priority = max(0, priority*0.6 - 5)
//	else                    -> priority = max(0, priority - 6)
//	consecutiveWrong = 0
func UpdatePriority(priority float64, consecutiveWrong int, correct bool) (float64, int) {
	priority = clampPriority(priority)
	if consecutiveWrong < 0 {
		consecutiveWrong = 0
	}

	if correct {
		if consecutiveWrong > 0 {
			priority = priority*0.6 - 5
		} else {
			priority -= 6
		}
		if priority < 0 {
			priority = 0
		}
		if priority > MaxPriority {
			priority = MaxPriority
		}
		return priority, 0
	}

	consecutiveWrong++
	priority += 15 + 10*float64(consecutiveWrong)
	if consecutiveWrong >= 2 {
		priority = MaxPriority
	}
	if priority > MaxPriority {
		priority = MaxPriority
	}
	return priority, consecutiveWrong
}
