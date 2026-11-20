package feed

import "testing"

func TestUpdatePriorityTwoWrongsReachMax(t *testing.T) {
	priority := 0.0
	cw := 0

	priority, cw = UpdatePriority(priority, cw, false)
	if priority != 25 || cw != 1 {
		t.Fatalf("first wrong = (%v,%d), want (25,1)", priority, cw)
	}

	priority, cw = UpdatePriority(priority, cw, false)
	if priority != 100 || cw != 2 {
		t.Fatalf("second wrong = (%v,%d), want (100,2)", priority, cw)
	}

	priority, cw = UpdatePriority(priority, cw, false)
	if priority != 100 || cw != 3 {
		t.Fatalf("third wrong = (%v,%d), want (100,3)", priority, cw)
	}
}

func TestUpdatePriorityCorrectDecays(t *testing.T) {
	// Without a wrong streak: -6.
	if p, cw := UpdatePriority(50, 0, true); p != 44 || cw != 0 {
		t.Fatalf("plain correct = (%v,%d), want (44,0)", p, cw)
	}
	// After wrong answers: priority*0.6 - 5 and the counter resets.
	if p, cw := UpdatePriority(100, 3, true); p != 55 || cw != 0 {
		t.Fatalf("correct after streak = (%v,%d), want (55,0)", p, cw)
	}
	// Floor at zero.
	if p, _ := UpdatePriority(2, 0, true); p != 0 {
		t.Fatalf("floor = %v, want 0", p)
	}
	if p, _ := UpdatePriority(4, 2, true); p != 0 {
		t.Fatalf("streak floor = %v, want 0", p)
	}
}

func TestUpdatePriorityClampsInput(t *testing.T) {
	if p, _ := UpdatePriority(-10, -5, false); p != 25 {
		t.Fatalf("negative input = %v, want 25", p)
	}
	if p, _ := UpdatePriority(500, 0, false); p != 100 {
		t.Fatalf("high input = %v, want 100", p)
	}
}
